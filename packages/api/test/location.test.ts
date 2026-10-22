import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Env } from "../src/env";
import worker, { ingest } from "../src/index";
import { normalizeIp, requestLocation } from "../src/location";
import { recent, summary } from "../src/queries";
import { database } from "./database";

let storage: Awaited<ReturnType<typeof database>>;
let env: Env;
const origin = "https://skyline.devopsrockstars.com";
const texas = {
  continent: "NA",
  country: "US",
  region: "Texas",
  regionCode: "TX",
  city: "Austin",
  timezone: "America/Chicago",
};
const click = () => ({
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  page: "/",
  target: "button",
  label: null as string | null,
});
const filters = () => ({
  site: null,
  from: Date.now() - 86_400_000,
  to: Date.now() + 300_000,
});

function request(
  events = [click()],
  cf: Record<string, unknown> | undefined = texas,
  ip = "203.0.113.8",
  site = "skyline",
) {
  const result = new Request("https://ct.a2f0.net/v1/clicks", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "text/plain",
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify({ site, events }),
  });
  Object.defineProperty(result, "cf", { value: cf });
  return result;
}

beforeEach(async () => {
  storage = await database();
  env = {
    DB: storage.db,
    SITES: { skyline: [origin], other: [origin] },
    INGEST_LIMITER: { limit: async () => ({ success: true }) },
  };
});
afterEach(() => storage.sqlite.close());

test("IP migration preserves historical rows and enforces location references", async () => {
  const old = new Database(":memory:");
  try {
    old.exec("PRAGMA foreign_keys = ON");
    for (const name of ["0001_clicks.sql", "0002_event_pagination.sql"])
      old.exec(
        await Bun.file(`${import.meta.dir}/../migrations/${name}`).text(),
      );
    old
      .query("INSERT INTO clicks VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("skyline", crypto.randomUUID(), 1, 1, "/", "button", null);
    old.exec(
      await Bun.file(
        `${import.meta.dir}/../migrations/0003_ip_locations.sql`,
      ).text(),
    );
    expect(
      old.query("SELECT ip_address, location_id FROM clicks").get(),
    ).toEqual({ ip_address: null, location_id: null });
    expect(() => old.exec("UPDATE clicks SET location_id = 999")).toThrow();
    expect(old.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    old.close();
  }
});

test("captures request IP and shared location atomically; retries preserve first receipt", async () => {
  const events = Array.from({ length: 50 }, click);
  expect((await ingest(request(events), env)).status).toBe(202);
  expect((await ingest(request([click()]), env)).status).toBe(202);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS count FROM locations").get(),
  ).toEqual({ count: 1 });
  expect(
    (
      await ingest(
        request(events, { country: "CA", city: "Toronto" }, "2001:db8::1"),
        env,
      )
    ).status,
  ).toBe(202);
  const data = await recent(env.DB, filters(), null);
  expect(data.events).toHaveLength(51);
  expect(
    data.events.every(
      (row) =>
        row.ip === "203.0.113.8" &&
        JSON.stringify(row.location) === JSON.stringify(texas),
    ),
  ).toBe(true);
  expect(
    data.events.every(
      (row) => !("locationId" in row) && !("received_at" in row),
    ),
  ).toBe(true);
});

test("stores IPv6 and missing geography without accepting client-supplied location", async () => {
  const missing = request([click()], {}, "2001:0db8:0:0:0:0:0:1");
  missing.headers.set("X-Forwarded-For", "198.51.100.9");
  missing.headers.set("CF-IPCountry", "GB");
  expect((await ingest(missing, env)).status).toBe(202);
  const absent = request([click()], {}, "invalid");
  expect((await ingest(absent, env)).status).toBe(202);
  const data = await recent(env.DB, filters(), null);
  expect(data.events.map((row) => row.ip).sort()).toEqual([
    "2001:db8::1",
    null,
  ]);
  expect(data.events.every((row) => row.location === null)).toBe(true);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS count FROM locations").get(),
  ).toEqual({ count: 0 });
  for (const extra of [{ ip: "198.51.100.9" }, { location: texas }]) {
    const forged = request([{ ...click(), ...extra }]);
    expect((await ingest(forged, env)).status).toBe(400);
  }
});

test("normalizes network metadata and handles unknown countries and pseudo IPv4", () => {
  for (const invalid of [
    null,
    "",
    "example.com",
    "1.2.3.999",
    "1.2.3",
    "01.2.3.4",
    "127.1",
    "1.2.3.4,5.6.7.8",
    "2001:::1",
    "fe80::1%eth0",
    "<script>",
  ])
    expect(normalizeIp(invalid)).toBeNull();
  expect(normalizeIp("2001:DB8::A")).toBe("2001:db8::a");
  const pseudo = request(
    [click()],
    {
      country: "XX",
      continent: "xx",
      city: "x".repeat(129),
      region: "\u0000",
      timezone: 42,
      regionCode: "!",
    },
    "240.1.2.3",
  );
  pseudo.headers.set("CF-Connecting-IPv6", "2001:db8::2");
  expect(requestLocation(pseudo)).toEqual({
    ip: "2001:db8::2",
    values: [null, null, null, null, null, null],
    key: null,
  });
  const tor = request([click()], { country: "T1" });
  expect(requestLocation(tor).key).toBeNull();
  const normal = request();
  normal.headers.set("CF-Connecting-IPv6", "2001:db8::2");
  expect(requestLocation(normal).ip).toBe("203.0.113.8");
});

test("accepted batches with Sec-GPC retain request metadata", async () => {
  // The SDK's explicit override controls delivery; ingestion does not silently
  // change the event schema or metadata policy based on a browser header.
  const batch = request();
  batch.headers.set("Sec-GPC", "1");
  expect((await ingest(batch, env)).status).toBe(202);
  const data = await recent(env.DB, filters(), null);
  expect(data.events[0]?.ip).toBe("203.0.113.8");
  expect(data.events[0]?.location).toEqual(texas);
});

test("geographic counts distinguish same-named cities and follow site/date filters", async () => {
  const geos = [
    texas,
    texas,
    { ...texas, region: "Minnesota", regionCode: "MN" },
    { country: "CA", city: "Austin" },
    {},
  ];
  for (const geo of geos) await ingest(request([click()], geo), env);
  await ingest(request([click()], texas, "203.0.113.8", "other"), env);
  const old = click();
  await ingest(request([old]), env);
  storage.sqlite
    .query("UPDATE clicks SET timestamp = ? WHERE id = ?")
    .run(Date.now() - 2 * 86_400_000, old.id);
  const data = await summary(env.DB, { ...filters(), site: "skyline" });
  expect(data.geography.countries).toEqual([
    { country: "US", clicks: 3 },
    { country: null, clicks: 1 },
    { country: "CA", clicks: 1 },
  ]);
  expect(data.geography.cities).toContainEqual({
    country: "US",
    region: "Texas",
    regionCode: "TX",
    city: "Austin",
    clicks: 2,
  });
  expect(data.geography.cities).toContainEqual({
    country: "US",
    region: "Minnesota",
    regionCode: "MN",
    city: "Austin",
    clicks: 1,
  });
  expect(data.geography.cities).toHaveLength(4);
  expect(data.geography.regions).toHaveLength(4);
  expect(data.totals).toEqual({ clicks: 5, sites: 1, pages: 1 });
});

test("joined pagination preserves IP and location across the cursor boundary", async () => {
  const events = Array.from({ length: 101 }, click);
  for (let offset = 0; offset < events.length; offset += 50)
    expect(
      (await ingest(request(events.slice(offset, offset + 50)), env)).status,
    ).toBe(202);
  const range = filters();
  const first = await recent(env.DB, range, null);
  const second = await recent(env.DB, range, first.nextCursor);
  expect(first.events).toHaveLength(100);
  expect(second.events).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  const all = [...first.events, ...second.events];
  expect(new Set(all.map((row) => row.id)).size).toBe(101);
  expect(
    all.every(
      (row) => row.ip === "203.0.113.8" && row.location?.city === "Austin",
    ),
  ).toBe(true);
});

test("a failing click rolls back both the location and every click in its batch", async () => {
  storage.sqlite.exec(
    "CREATE TRIGGER fail_click BEFORE INSERT ON clicks WHEN NEW.label = 'reject-click' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  expect(
    (
      await ingest(
        request([click(), { ...click(), label: "reject-click" }]),
        env,
      )
    ).status,
  ).toBe(503);
  for (const table of ["clicks", "locations"])
    expect(
      storage.sqlite.query(`SELECT COUNT(*) AS count FROM ${table}`).get(),
    ).toEqual({ count: 0 });
});

test("retention deletes expired IPs and unused locations but keeps shared locations", async () => {
  const expired = click();
  const sharedExpired = click();
  const retained = click();
  await ingest(request([expired], { country: "CA" }), env);
  await ingest(request([sharedExpired, retained], texas), env);
  await ingest(request([retained], { country: "DE" }), env);
  storage.sqlite
    .query("UPDATE clicks SET timestamp = ? WHERE id IN (?, ?)")
    .run(Date.now() - 91 * 86_400_000, expired.id, sharedExpired.id);
  await worker.scheduled({} as ScheduledController, env);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS count FROM clicks").get(),
  ).toEqual({ count: 1 });
  expect(storage.sqlite.query("SELECT country FROM locations").all()).toEqual([
    { country: "US" },
  ]);
  expect(storage.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
});
