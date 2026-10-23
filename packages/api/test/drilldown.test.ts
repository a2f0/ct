import { afterEach, beforeEach, expect, test } from "bun:test";
import { admin } from "../src/admin";
import type { AdminEnv, Env } from "../src/env";
import { ingest } from "../src/index";
import { authenticateTestAccount, TEST_AUTH } from "./authHelpers";
import { database } from "./database";

let storage: Awaited<ReturnType<typeof database>>;
let env: Env;
let cookie = "";
const origin = "https://skyline.devopsrockstars.com";
const texas = { country: "US", region: "Texas", regionCode: "TX" };
const click = (page = "/", target = "button", label: string | null = null) => ({
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  page,
  target,
  label,
});

beforeEach(async () => {
  storage = await database();
  cookie = await authenticateTestAccount(storage.db);
  env = {
    DB: storage.db,
    SITES: { skyline: { [origin]: "production" } },
    INGEST_LIMITER: { limit: async () => ({ success: true }) },
  };
});
afterEach(() => storage.sqlite.close());

async function deliver(
  events: ReturnType<typeof click>[],
  ip: string,
  cf: Record<string, unknown>,
) {
  const request = new Request("https://ct.a2f0.net/v1/clicks", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "text/plain",
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify({ site: "skyline", events }),
  });
  Object.defineProperty(request, "cf", { value: cf });
  expect((await ingest(request, env)).status).toBe(202);
}

function get(path: string) {
  const request = new Request(`https://ct-admin.a2f0.net/api/${path}`);
  request.headers.set("Cookie", cookie);
  return admin(request, {
    ...TEST_AUTH,
    DB: storage.db,
    SITES: env.SITES,
    READ_LIMITER: env.INGEST_LIMITER,
    ASSETS: {} as Fetcher,
  } satisfies AdminEnv);
}

async function events(query: string) {
  const response = await get(`events?${query}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { events: { page: string }[] }).events;
}

test("drill-down filters select exact values, and ~unknown matches the overview's Unknown groups", async () => {
  await deliver(
    [click("/a", "button", "nav.home"), click("/a", "button", "nav.home")],
    "203.0.113.8",
    { ...texas, city: "Austin" },
  );
  await deliver([click("/b")], "198.51.100.7", {
    country: "US",
    region: "Minnesota",
    regionCode: "MN",
    city: "Austin",
  });
  await deliver([click("/c", "a")], "2001:db8::1", {
    country: "CA",
    city: "Toronto",
  });
  await deliver([click("/a")], "invalid", {});

  for (const [query, expected] of [
    ["ip=203.0.113.8", 2],
    ["ip=2001:DB8:0::1", 1],
    ["ip=~unknown", 1],
    ["country=US", 3],
    ["country=US&region=Texas", 2],
    ["country=US&region=Texas&city=Austin", 2],
    ["country=US&city=Austin", 3],
    ["country=CA&region=~unknown", 1],
    ["country=~unknown", 1],
    ["page=/a", 3],
    ["target=button", 4],
    ["target=button&label=nav.home", 2],
    ["target=button&label=~unknown", 2],
    ["page=/a&ip=203.0.113.8&environment=staging", 0],
  ] as const)
    expect(await events(query)).toHaveLength(expected);

  const summary = (await (await get("summary?country=US")).json()) as {
    totals: { clicks: number };
    geography: { countries: unknown[]; regions: unknown[] };
  };
  expect(summary.totals.clicks).toBe(3);
  expect(summary.geography.countries).toEqual([{ country: "US", clicks: 3 }]);
  expect(summary.geography.regions).toHaveLength(2);
});

test("drill-down pages keep their filter across cursors and use the IP index", async () => {
  const prepared: string[] = [];
  const prepare = storage.db.prepare.bind(storage.db);
  storage.db.prepare = ((sql: string) => {
    prepared.push(sql);
    return prepare(sql);
  }) as D1Database["prepare"];
  const many = Array.from({ length: 101 }, () => click());
  for (let index = 0; index < many.length; index += 50)
    await deliver(many.slice(index, index + 50), "203.0.113.8", texas);
  await deliver([click()], "203.0.113.9", texas);

  const first = (await (await get("events?ip=203.0.113.8")).json()) as {
    events: { ip: string }[];
    nextCursor: string;
  };
  const second = (await (
    await get(`events?ip=203.0.113.8&cursor=${first.nextCursor}`)
  ).json()) as typeof first;
  expect(first.events).toHaveLength(100);
  expect(second.events).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(
    [...first.events, ...second.events].every(
      (row) => row.ip === "203.0.113.8",
    ),
  ).toBe(true);

  const sql = prepared
    .filter((statement) => statement.includes("ip_address = ?"))
    .at(-1);
  const plan = storage.sqlite
    .query(`EXPLAIN QUERY PLAN ${sql}`)
    .all(0, 0, "", 0, "", "") as { detail: string }[];
  expect(plan.map((step) => step.detail).join("\n")).toContain(
    "clicks_ip_time",
  );
});

test("invalid drill-down values are rejected without querying clicks", async () => {
  for (const query of [
    "ip=203.0.113.256",
    "ip=example.com",
    "country=us",
    "country=USA",
    `region=${"r".repeat(129)}`,
    "city=%00",
    "page=relative",
    "target=Button",
    "label=two%20words",
  ]) {
    const response = await get(`events?${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid filter or date range (maximum 90 days)",
    });
  }
});
