import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { CLIENT_PROTOCOL } from "../../../scripts/collectorReady";
import { admin as handleAdmin } from "../src/admin";
import type { AdminEnv, Env } from "../src/env";
import { ingest } from "../src/index";
import { authenticateTestAccount, TEST_AUTH } from "./authHelpers";
import { database } from "./database";

let cookie = "";
const admin = (request: Request, env: AdminEnv) => {
  request.headers.set("Cookie", cookie);
  return handleAdmin(request, env);
};

let storage: Awaited<ReturnType<typeof database>>;
let env: Env;
const production = "https://devopsrockstars.com";
const staging = "https://staging.devopsrockstars.com";
beforeEach(async () => {
  storage = await database();
  cookie = await authenticateTestAccount(storage.db);
  env = {
    DB: storage.db,
    SITES: {
      devopsrockstars: { [production]: "production", [staging]: "staging" },
    },
    INGEST_LIMITER: { limit: async () => ({ success: true }) },
  };
});
afterEach(() => storage.sqlite.close());
const click = () => ({
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  page: "/",
  target: "canvas",
  label: null,
});
function post(body: unknown, origin = production) {
  return ingest(
    new Request("https://ct.a2f0.net/v1/clicks", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    }),
    env,
  );
}
async function get(path: string) {
  return admin(new Request(`https://ct-admin.a2f0.net/api/${path}`), {
    ...TEST_AUTH,
    DB: storage.db,
    SITES: env.SITES,
    READ_LIMITER: env.INGEST_LIMITER,
    ASSETS: {} as Fetcher,
  } satisfies AdminEnv);
}

test("migration preserves old clients and backfills only the historically known Skyline environment", async () => {
  const old = new Database(":memory:");
  try {
    for (const name of [
      "0001_clicks.sql",
      "0002_event_pagination.sql",
      "0003_ip_locations.sql",
    ])
      old.exec(
        await Bun.file(`${import.meta.dir}/../migrations/${name}`).text(),
      );
    for (const site of ["skyline", "other"])
      old
        .query(
          "INSERT INTO clicks (site,id,timestamp,received_at,page,target,label) VALUES (?, ?, 1, 1, '/', 'button', NULL)",
        )
        .run(site, crypto.randomUUID());
    old.exec(
      await Bun.file(
        `${import.meta.dir}/../migrations/0004_dimensions.sql`,
      ).text(),
    );
    expect(
      old
        .query("SELECT site, app, environment FROM clicks ORDER BY site")
        .all(),
    ).toEqual([
      { site: "other", app: null, environment: null },
      { site: "skyline", app: null, environment: "production" },
    ]);
    old
      .query(
        "INSERT INTO clicks (site,id,timestamp,received_at,page,target,label) VALUES ('skyline', ?, 2, 2, '/', 'button', NULL)",
      )
      .run(crypto.randomUUID());
    expect(() =>
      old.exec("UPDATE clicks SET environment = 'preview'"),
    ).toThrow();
    const indexes = old
      .query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('clicks_app_time', 'clicks_environment_time', 'clicks_site_environment_app_time')",
      )
      .all();
    expect(indexes).toHaveLength(3);
  } finally {
    old.close();
  }
});

test("environment is derived from exact registered origin, and explicit mismatches fail atomically", async () => {
  for (const origin of [production, staging]) {
    const expected = origin === production ? "production" : "staging";
    expect(
      (await post({ site: "devopsrockstars", events: [click()] }, origin))
        .status,
    ).toBe(202);
    expect(
      (
        await post(
          {
            site: "devopsrockstars",
            environment: expected,
            events: [{ ...click(), app: "skyline" }],
          },
          origin,
        )
      ).status,
    ).toBe(202);
    for (const environment of [
      expected === "production" ? "staging" : "production",
      "preview",
      null,
      {},
      "",
    ])
      expect(
        (
          await post(
            { site: "devopsrockstars", environment, events: [click()] },
            origin,
          )
        ).status,
      ).toBe(400);
  }
  expect(
    storage.sqlite
      .query(
        "SELECT environment, COUNT(*) AS n FROM clicks GROUP BY environment ORDER BY environment",
      )
      .all(),
  ).toEqual([
    { environment: "production", n: 2 },
    { environment: "staging", n: 2 },
  ]);
  expect(
    (
      await post(
        {
          site: "devopsrockstars",
          environment: "production",
          events: [click()],
        },
        "https://devopsrockstars.com.evil.example",
      )
    ).status,
  ).toBe(403);
});

test("bounded app identifiers and strict event shape protect entire batches", async () => {
  for (const app of [
    "",
    "a".repeat(65),
    "Skyline",
    "private@example.com",
    1,
    {},
    [],
  ])
    expect(
      (
        await post({
          site: "devopsrockstars",
          events: [click(), { ...click(), app }],
        })
      ).status,
    ).toBe(400);
  expect(
    (
      await post({
        site: "devopsrockstars",
        events: [{ ...click(), environment: "production" }],
      })
    ).status,
  ).toBe(400);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS n FROM clicks").get(),
  ).toEqual({ n: 0 });
  expect(
    (
      await post({
        site: "devopsrockstars",
        events: [
          { ...click(), app: null },
          { ...click(), app: "a".repeat(64) },
        ],
      })
    ).status,
  ).toBe(202);
});

test("filters scope counts and every cursor page while Unknown and retries retain their dimensions", async () => {
  const events = Array.from({ length: 101 }, () => ({
    ...click(),
    app: "skyline",
  }));
  for (let i = 0; i < events.length; i += 50)
    expect(
      (
        await post(
          { site: "devopsrockstars", events: events.slice(i, i + 50) },
          staging,
        )
      ).status,
    ).toBe(202);
  expect(
    (
      await post({
        site: "devopsrockstars",
        environment: "production",
        events: [{ ...events[0], app: "changed" }],
      })
    ).status,
  ).toBe(202);
  expect(
    (
      await post({
        site: "devopsrockstars",
        events: [click(), { ...click(), app: "resume" }],
      })
    ).status,
  ).toBe(202);
  const query = "site=devopsrockstars&app=skyline&environment=staging";
  const report = (await (await get(`summary?${query}`)).json()) as {
    totals: { clicks: number };
    apps: unknown[];
    environments: unknown[];
  };
  expect(report.totals.clicks).toBe(101);
  expect(report.apps).toEqual([{ app: "skyline", clicks: 101 }]);
  expect(report.environments).toEqual([
    { environment: "staging", clicks: 101 },
  ]);
  const first = (await (await get(`events?${query}`)).json()) as {
    events: { id: string; app: string; environment: string }[];
    nextCursor: string;
  };
  const last = (await (
    await get(`events?${query}&cursor=${first.nextCursor}`)
  ).json()) as typeof first;
  const combined = [...first.events, ...last.events];
  expect(first.events).toHaveLength(100);
  expect(last.events).toHaveLength(1);
  expect(last.nextCursor).toBeNull();
  expect(new Set(combined.map((row) => row.id)).size).toBe(101);
  expect(
    combined.every(
      (row) => row.app === "skyline" && row.environment === "staging",
    ),
  ).toBe(true);
  const unknown = (await (
    await get("events?app=~unknown&environment=production")
  ).json()) as { events: unknown[] };
  expect(unknown.events).toHaveLength(1);
  const all = (await (await get("summary")).json()) as {
    totals: { clicks: number };
  };
  expect(all.totals.clicks).toBe(103);
  expect(await (await get("sites")).json()).toMatchObject({
    apps: ["resume", "skyline"],
    environments: ["production", "staging"],
  });
  for (const query of [
    "app=private%40example.com",
    `app=${"a".repeat(65)}`,
    "environment=preview",
    "environment=all",
  ])
    expect((await get(`events?${query}`)).status).toBe(400);
});

test("unknown environments and bounded retained app choices remain available independently", async () => {
  const now = Date.now();
  const insert = storage.sqlite.query(
    "INSERT INTO clicks (site,id,timestamp,received_at,page,target,label,app,environment) VALUES ('devopsrockstars', ?, ?, ?, '/', 'canvas', NULL, ?, NULL)",
  );
  for (let i = 0; i < 501; i++)
    insert.run(
      crypto.randomUUID(),
      now,
      now,
      `app-${String(i).padStart(3, "0")}`,
    );
  insert.run(crypto.randomUUID(), now - 91 * 86400000, now, "000-expired");
  const metadata = (await (await get("sites")).json()) as { apps: string[] };
  expect(metadata.apps).toHaveLength(500);
  expect(metadata.apps[0]).toBe("app-000");
  expect(metadata.apps.at(-1)).toBe("app-499");
  const unknown = (await (
    await get("summary?environment=~unknown&app=app-500")
  ).json()) as { totals: { clicks: number } };
  expect(unknown.totals.clicks).toBe(1);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = ((sql: string) =>
    sql.startsWith("SELECT DISTINCT app")
      ? {
          bind: () => ({
            all: async () => {
              throw new Error("app metadata offline");
            },
          }),
        }
      : prepare(sql)) as D1Database["prepare"];
  expect(await (await get("sites")).json()).toMatchObject({
    sites: ["devopsrockstars"],
    apps: [],
  });
});

test("the actual collector declares the protocol required by publication", async () => {
  const health = (await (
    await ingest(new Request("https://ct.a2f0.net/health"), {} as Env)
  ).json()) as { protocolVersion: number };
  expect(health.protocolVersion).toBeGreaterThanOrEqual(CLIENT_PROTOCOL);
});
