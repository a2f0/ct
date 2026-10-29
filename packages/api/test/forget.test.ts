import { beforeEach, expect, test } from "bun:test";
import { admin } from "../src/admin";
import { DAY } from "../src/env";
import { authenticateTestAccount, TEST_AUTH } from "./authHelpers";
import { adminEnv, rateLimit } from "./bindings";
import { useDatabase } from "./database";

const storage = useDatabase();
let cookie = "";
let limited = false;

beforeEach(async () => {
  cookie = await authenticateTestAccount(storage.db);
  limited = false;
  const locations = storage.sqlite.query(
    "INSERT INTO locations (id, location_key, country, city) VALUES (?, ?, ?, ?)",
  );
  locations.run(1, "austin", "US", "Austin");
  locations.run(2, "toronto", "CA", "Toronto");
  const clicks = storage.sqlite.query(
    "INSERT INTO clicks (site, id, timestamp, received_at, page, target, label, environment, ip_address, location_id) VALUES (?, ?, ?, ?, '/', 'button', NULL, ?, ?, ?)",
  );
  const now = Date.now();
  for (const [site, age, environment, ip, location] of [
    ["skyline", 0, "production", "203.0.113.8", 1],
    ["skyline", 60 * DAY, "staging", "203.0.113.8", 2],
    ["other", DAY, null, "203.0.113.8", null],
    ["skyline", 0, "production", "198.51.100.7", 1],
    ["skyline", 0, "production", "2001:db8::1", null],
    ["skyline", 0, "production", null, null],
  ] as const)
    clicks.run(
      site,
      crypto.randomUUID(),
      now - age,
      now - age,
      environment,
      ip,
      location,
    );
});

function forget(
  body: unknown,
  {
    method = "POST",
    origin = TEST_AUTH.BETTER_AUTH_URL,
    type = "application/json",
    session = cookie,
  } = {},
) {
  return admin(
    new Request(`${TEST_AUTH.BETTER_AUTH_URL}/api/forget`, {
      method,
      headers: { Origin: origin, "Content-Type": type, Cookie: session },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
    { ...adminEnv(storage.db, {}), READ_LIMITER: rateLimit(!limited) },
  );
}
const ips = () =>
  (
    storage.sqlite
      .query("SELECT ip_address AS ip FROM clicks ORDER BY ip_address")
      .all() as { ip: string | null }[]
  ).map((row) => row.ip);
const ALL = [
  null,
  "198.51.100.7",
  "2001:db8::1",
  "203.0.113.8",
  "203.0.113.8",
  "203.0.113.8",
];

test("forgetting an IP deletes its clicks across sites, environments and dates, and locations only it used", async () => {
  const response = await forget({ ip: "203.0.113.8" });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ ip: "203.0.113.8", deleted: 3 });
  expect(ips()).toEqual([null, "198.51.100.7", "2001:db8::1"]);
  // Austin is still referenced by another address; Toronto is not.
  expect(storage.sqlite.query("SELECT id FROM locations").all()).toEqual([
    { id: 1 },
  ]);

  // Addresses are canonicalized like stored ones, and repeats are harmless.
  expect(await (await forget({ ip: "2001:DB8:0::1" })).json()).toEqual({
    ip: "2001:db8::1",
    deleted: 1,
  });
  expect(await (await forget({ ip: "203.0.113.8" })).json()).toEqual({
    ip: "203.0.113.8",
    deleted: 0,
  });
  expect(ips()).toEqual([null, "198.51.100.7"]);
});

test("forgetting requires a session, the dashboard origin, JSON and one valid address", async () => {
  for (const [name, response, status] of [
    ["anonymous", await forget({ ip: "203.0.113.8" }, { session: "" }), 401],
    [
      "foreign origin",
      await forget({ ip: "203.0.113.8" }, { origin: "https://evil.example" }),
      403,
    ],
    [
      "missing origin",
      await forget({ ip: "203.0.113.8" }, { origin: "" }),
      403,
    ],
    [
      "form media type",
      await forget(
        { ip: "203.0.113.8" },
        { type: "application/x-www-form-urlencoded" },
      ),
      415,
    ],
    ["GET", await forget(null, { method: "GET" }), 405],
    ["DELETE", await forget(null, { method: "DELETE" }), 405],
    ["unknown IP", await forget({ ip: "~unknown" }), 400],
    ["empty IP", await forget({ ip: "" }), 400],
    ["missing IP", await forget({}), 400],
    ["hostname", await forget({ ip: "example.com" }), 400],
    ["out of range", await forget({ ip: "203.0.113.256" }), 400],
    ["number", await forget({ ip: 3405803784 }), 400],
    ["list", await forget(["203.0.113.8"]), 400],
    ["extra field", await forget({ ip: "203.0.113.8", site: "skyline" }), 400],
    [
      "oversized",
      await forget({ ip: "203.0.113.8", pad: "a".repeat(1100) }),
      400,
    ],
  ] as const)
    expect({ name, status: response.status }).toEqual({ name, status });
  expect((await forget(null, { method: "GET" })).headers.get("Allow")).toBe(
    "POST",
  );
  limited = true;
  expect((await forget({ ip: "203.0.113.8" })).status).toBe(429);
  expect(ips()).toEqual(ALL);
});
