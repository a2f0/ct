import { isIP } from "node:net";
import { expect, test } from "@playwright/test";
import type { Tracker } from "../packages/client/src/types";

declare global {
  interface Window {
    tracker: Tracker;
    ready: boolean;
  }
}

test("a full 50-click delivery round-trips through the real Worker and migrated D1", async ({
  request,
}) => {
  const events = Array.from({ length: 50 }, () => ({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    page: "/batch-test",
    target: "button",
    label: "full-batch",
  }));
  const response = await request.post("http://127.0.0.1:4175/v1/clicks", {
    headers: {
      Origin: "http://127.0.0.1:4174",
      "CF-Connecting-IP": "203.0.113.10",
    },
    data: { site: "skyline", events },
  });
  expect(response.status()).toBe(202);
  const result = await request.get(
    "http://127.0.0.1:4176/api/events?site=skyline",
  );
  expect(result.status()).toBe(200);
  const ids = new Set<string>(events.map((event) => event.id));
  const stored = (await result.json()).events.filter((event: { id: string }) =>
    ids.has(event.id),
  );
  expect(stored).toHaveLength(50);
  expect(
    stored.every(
      (event: { ip: string | null; location: unknown }) =>
        Object.hasOwn(event, "ip") && Object.hasOwn(event, "location"),
    ),
  ).toBe(true);
  for (const event of stored) {
    expect(event.ip).not.toBeNull();
    expect(isIP(event.ip)).toBeGreaterThan(0);
    if (isIP(event.ip) === 6) {
      expect(new URL(`http://[${event.ip}]/`).hostname).toBe(`[${event.ip}]`);
    }
  }
});

test("inert before init and blocked in automated browsers", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/clicks")) requests++;
  });
  await page.goto("/");
  await page.waitForFunction(() => window.ready);
  await page
    .getByRole("button", { name: "Open private building", exact: true })
    .click();
  expect(await page.evaluate(() => window.tracker.init())).toBe(false);
  await page
    .getByRole("button", { name: "Open private building", exact: true })
    .click();
  await page.evaluate(() => window.tracker.flush());
  expect(requests).toBe(0);
});

test("trusted SVG, shadow and background clicks travel through the real Worker and D1", async ({
  page,
  request,
}) => {
  const batches: {
    events: { page: string; target: string; label: string | null }[];
  }[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith("/v1/clicks")) batches.push(req.postDataJSON());
  });
  await page.goto("/?human=1");
  await page.waitForFunction(() => window.ready);
  expect(await page.evaluate(() => window.tracker.init())).toBe(true);
  await page.locator("svg rect").click();
  await page.getByRole("button", { name: "Shadow building" }).click();
  await page.locator("#blank").click();
  await page.getByLabel("Private input").click();
  await page.getByRole("button", { name: "Ignored button" }).click();
  await page.evaluate(() => window.tracker.flush());
  await expect
    .poll(() => batches.flatMap((batch) => batch.events).length)
    .toBe(3);
  const events = batches.flatMap((batch) => batch.events);
  expect(events.map((event) => event.target)).toEqual([
    "rect",
    "button",
    "div",
  ]);
  expect(events.every((event) => event.page === "/test/:route")).toBe(true);
  const response = await request.get(
    "http://127.0.0.1:4176/api/events?site=skyline",
  );
  expect(response.ok()).toBe(true);
  expect(
    (await response.json()).events.some(
      (event: { label: string }) => event.label === "svg-building",
    ),
  ).toBe(true);
});

test("disabling tracking clears pending events and prevents further requests", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/clicks")) requests.push(request.url());
  });
  await page.goto("/?human=1");
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => window.tracker.init());
  await page
    .getByRole("button", { name: "Open private building", exact: true })
    .click();
  await page.evaluate(() => {
    window.tracker.setOptOut(true);
    return window.tracker.flush();
  });
  await page
    .getByRole("button", { name: "Open private building", exact: true })
    .click();
  await page.evaluate(() => window.tracker.flush());
  expect(requests).toHaveLength(0);
});

test("GPC requires explicit override and site opt-out still stops delivery", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "globalPrivacyControl", {
      value: true,
    }),
  );
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/clicks")) requests.push(request.url());
  });
  await page.goto("/?human=1");
  await page.waitForFunction(() => window.ready);
  expect(await page.evaluate(() => window.tracker.init())).toBe(false);
  await page
    .getByRole("button", { name: "Open private building", exact: true })
    .click();
  await page.evaluate(() => window.tracker.flush());
  expect(requests).toHaveLength(0);

  await page.goto("/?human=1&overrideGpc=true");
  await page.waitForFunction(() => window.ready);
  expect(await page.evaluate(() => window.tracker.init())).toBe(true);
  const response = page.waitForResponse((response) =>
    response.url().endsWith("/v1/clicks"),
  );
  await page
    .getByRole("button", { name: "Open private building", exact: true })
    .click();
  await page.evaluate(() => window.tracker.flush());
  expect((await response).status()).toBe(202);
  expect(requests).toHaveLength(1);
  await page.evaluate(() => window.tracker.setOptOut(true));
  await page
    .getByRole("button", { name: "Open private building", exact: true })
    .click();
  await page.evaluate(() => window.tracker.flush());
  expect(requests).toHaveLength(1);
});
