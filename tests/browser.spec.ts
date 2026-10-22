import { expect, test } from "@playwright/test";
import type { Tracker } from "../packages/client/src/types";

declare global {
  interface Window {
    tracker: Tracker;
    ready: boolean;
  }
}

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

test("public dashboard loads data with filtering and a responsive read-only view", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4176");
  await expect(
    page.getByRole("heading", { name: "Click activity." }),
  ).toBeVisible();
  await expect(page.getByText("Public · read only")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Site", exact: true })
    .selectOption("skyline");
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await expect(page.getByRole("table")).toBeVisible();
  await page.screenshot({
    path: `test-results/admin-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/admin-mobile-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("refreshing during pagination does not show a cancelled-request error", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/events?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("cursor")) {
      started?.();
      await paused;
      await route
        .fulfill({ json: { events: [], nextCursor: null } })
        .catch(() => undefined);
    } else
      await route.fulfill({ json: { events: [], nextCursor: "next-page" } });
  });
  await page.goto("http://127.0.0.1:4176");
  await page.getByRole("button", { name: "Load 100 more" }).click();
  await requested;
  await page.getByRole("button", { name: "Refresh data" }).click();
  release?.();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
