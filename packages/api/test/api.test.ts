import { afterEach, beforeEach, expect, test } from "bun:test";
import { admin } from "../src/admin";
import type { AdminEnv, Env } from "../src/env";
import worker, { ingest } from "../src/index";
import { database } from "./database";

let storage: Awaited<ReturnType<typeof database>>;
let env: Env;
const origin = "https://skyline.devopsrockstars.com";
beforeEach(async () => {
  storage = await database();
  env = {
    DB: storage.db,
    SITES: { skyline: [origin] },
    INGEST_LIMITER: { limit: async () => ({ success: true }) },
  };
});
afterEach(() => storage.sqlite.close());
const event = () => ({
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  page: "/skyline-3d",
  target: "button",
  label: "open-building",
});
function request(body: unknown, requestOrigin = origin) {
  return new Request("https://ct.a2f0.net/v1/clicks", {
    method: "POST",
    headers: { Origin: requestOrigin, "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
}
function adminEnv(): AdminEnv {
  return {
    DB: storage.db,
    SITES: env.SITES,
    READ_LIMITER: env.INGEST_LIMITER,
    ASSETS: { fetch: async () => new Response("assets") } as unknown as Fetcher,
  };
}

test("writes a valid batch atomically and deduplicates retries", async () => {
  const batch = { site: "skyline", events: [event(), event()] };
  expect((await ingest(request(batch), env)).status).toBe(202);
  expect((await ingest(request(batch), env)).status).toBe(202);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS count FROM clicks").get(),
  ).toEqual({ count: 2 });
});

test("rejects foreign origins, unknown sites, missing origin and cross-site impersonation", async () => {
  expect(
    (
      await ingest(
        request({ site: "skyline", events: [event()] }, "https://evil.example"),
        env,
      )
    ).status,
  ).toBe(403);
  expect(
    (await ingest(request({ site: "other", events: [event()] }), env)).status,
  ).toBe(403);
  env.SITES.other = ["https://other.example"];
  expect(
    (await ingest(request({ site: "other", events: [event()] }), env)).status,
  ).toBe(403);
  const absent = request({ site: "skyline", events: [event()] });
  absent.headers.delete("Origin");
  expect((await ingest(absent, env)).status).toBe(403);
});

test("validates every event before any write and rejects extra metadata", async () => {
  for (const invalid of [
    { ...event(), page: "/?email=private" },
    { ...event(), timestamp: 0 },
    { ...event(), timestamp: 1.5 },
    { ...event(), timestamp: Number.MAX_SAFE_INTEGER + 1 },
    { ...event(), email: "private@example.com" },
    { ...event(), label: "user@example.com" },
  ]) {
    expect(
      (
        await ingest(
          request({ site: "skyline", events: [event(), invalid] }),
          env,
        )
      ).status,
    ).toBe(400);
  }
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS count FROM clicks").get(),
  ).toEqual({ count: 0 });
});

test("keeps delayed click times and replaces unreasonable device clocks", async () => {
  const now = Date.now();
  const timestamps = [now - 60_000, now - 2 * 86_400_000, now + 600_000];
  const batch = timestamps.map((timestamp) => ({ ...event(), timestamp }));
  expect(
    (await ingest(request({ site: "skyline", events: batch }), env)).status,
  ).toBe(202);
  for (const [index, click] of batch.entries()) {
    const row = storage.sqlite
      .query("SELECT timestamp, received_at FROM clicks WHERE id = ?")
      .get(click.id) as { timestamp: number; received_at: number };
    expect(row.timestamp).toBe(index === 0 ? click.timestamp : row.received_at);
  }
});

test("accepts case-insensitive media types and rejects invalid configured site names", async () => {
  const valid = request({ site: "skyline", events: [event()] });
  valid.headers.set("Content-Type", "Application/JSON; charset=utf-8");
  expect((await ingest(valid, env)).status).toBe(202);
  env.SITES.Invalid_Site = [origin];
  expect(
    (await ingest(request({ site: "Invalid_Site", events: [event()] }), env))
      .status,
  ).toBe(403);
});

test("enforces batch and byte limits and handles CORS preflight", async () => {
  expect(
    (
      await ingest(
        request({ site: "skyline", events: Array.from({ length: 51 }, event) }),
        env,
      )
    ).status,
  ).toBe(400);
  expect((await ingest(request("x".repeat(33_000)), env)).status).toBe(413);
  const response = await ingest(
    new Request("https://ct.a2f0.net/v1/clicks", {
      method: "OPTIONS",
      headers: { Origin: origin },
    }),
    env,
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
});

test("storage failure is retriable; rate limits prevent writes", async () => {
  env.INGEST_LIMITER = { limit: async () => ({ success: false }) };
  const limited = await ingest(
    request({ site: "skyline", events: [event()] }),
    env,
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("60");
  env.INGEST_LIMITER = { limit: async () => ({ success: true }) };
  env.DB.batch = async () => {
    throw new Error("offline");
  };
  expect(
    (await ingest(request({ site: "skyline", events: [event()] }), env)).status,
  ).toBe(503);
});

test("public admin is read-only and aggregates actual SQLite rows", async () => {
  await ingest(request({ site: "skyline", events: [event(), event()] }), env);
  const response = await admin(
    new Request("https://ct-admin.a2f0.net/api/summary?site=skyline"),
    adminEnv(),
  );
  expect(response.status).toBe(200);
  const data = (await response.json()) as {
    totals: { clicks: number; sites: number; pages: number };
    pages: unknown[];
  };
  expect(data.totals).toEqual({ clicks: 2, sites: 1, pages: 1 });
  expect(data.pages).toEqual([
    { site: "skyline", page: "/skyline-3d", clicks: 2 },
  ]);
  for (const method of ["POST", "PUT", "DELETE", "PATCH"])
    expect(
      (
        await admin(
          new Request("https://ct-admin.a2f0.net/api/events", { method }),
          adminEnv(),
        )
      ).status,
    ).toBe(405);
});

test("pagination has no gaps or repeats for tied timestamps across sites", async () => {
  const now = Date.now();
  env.SITES.other = [origin];
  const ids = Array.from({ length: 60 }, () => crypto.randomUUID());
  for (const site of ["skyline", "other"])
    for (const id of ids)
      storage.sqlite
        .query("INSERT INTO clicks VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(site, id, now, now, "/", "svg", null);
  const first = (await (
    await admin(new Request("https://ct-admin.a2f0.net/api/events"), adminEnv())
  ).json()) as { events: { id: string; site: string }[]; nextCursor: string };
  expect(first.events).toHaveLength(100);
  const second = (await (
    await admin(
      new Request(
        `https://ct-admin.a2f0.net/api/events?cursor=${first.nextCursor}`,
      ),
      adminEnv(),
    )
  ).json()) as { events: { id: string; site: string }[]; nextCursor: null };
  expect(second.events).toHaveLength(20);
  expect(second.nextCursor).toBeNull();
  expect(
    new Set(
      [...first.events, ...second.events].map((row) => `${row.site}:${row.id}`),
    ).size,
  ).toBe(120);
});

test("public rows and cursors use click time without exposing batch receipt time", async () => {
  const now = Date.now();
  for (let index = 0; index < 101; index++)
    storage.sqlite
      .query("INSERT INTO clicks VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        "skyline",
        crypto.randomUUID(),
        now - index * 1000,
        now + index,
        "/",
        "svg",
        null,
      );
  const response = await admin(
    new Request("https://ct-admin.a2f0.net/api/events"),
    adminEnv(),
  );
  const data = (await response.json()) as {
    events: { timestamp: number; received_at?: number }[];
    nextCursor: string;
  };
  expect(data.events.map((row) => row.timestamp)).toEqual(
    Array.from({ length: 100 }, (_, index) => now - index * 1000),
  );
  expect(data.events.every((row) => !("received_at" in row))).toBe(true);
  expect(data.nextCursor.split("_")[0]).toBe(String(now - 99_000));
});

test("uppercase UUID ingestion remains cursor-paginatable", async () => {
  const events = Array.from({ length: 101 }, () => ({
    ...event(),
    id: crypto.randomUUID().toUpperCase(),
  }));
  for (let offset = 0; offset < events.length; offset += 50)
    expect(
      (
        await ingest(
          request({
            site: "skyline",
            events: events.slice(offset, offset + 50),
          }),
          env,
        )
      ).status,
    ).toBe(202);
  const first = (await (
    await admin(new Request("https://ct-admin.a2f0.net/api/events"), adminEnv())
  ).json()) as { nextCursor: string };
  expect(
    (
      await admin(
        new Request(
          `https://ct-admin.a2f0.net/api/events?cursor=${first.nextCursor}`,
        ),
        adminEnv(),
      )
    ).status,
  ).toBe(200);
});

test("rejects invalid admin filters and cursors; assets have CSP", async () => {
  for (const query of [
    "site=unknown",
    "from=bad",
    "from=2020-01-01&to=2026-01-01",
    "from=2026-02-02&to=2026-01-01",
  ])
    expect(
      (
        await admin(
          new Request(`https://ct-admin.a2f0.net/api/summary?${query}`),
          adminEnv(),
        )
      ).status,
    ).toBe(400);
  expect(
    (
      await admin(
        new Request("https://ct-admin.a2f0.net/api/events?cursor=invalid"),
        adminEnv(),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await admin(new Request("https://ct-admin.a2f0.net/"), adminEnv())
    ).headers.get("Content-Security-Policy"),
  ).toContain("frame-ancestors 'none'");
});

test("daily retention removes only events older than 90 days", async () => {
  storage.sqlite
    .query("INSERT INTO clicks VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(
      "skyline",
      crypto.randomUUID(),
      Date.now() - 91 * 86_400_000,
      Date.now(),
      "/",
      "svg",
      null,
    );
  await ingest(request({ site: "skyline", events: [event()] }), env);
  await worker.scheduled({} as ScheduledController, env);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS count FROM clicks").get(),
  ).toEqual({ count: 1 });
});
