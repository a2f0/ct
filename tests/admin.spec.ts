import type { ClickRow } from "../packages/admin/src/data";
import { expect, test } from "./authenticated";

const admin = "http://127.0.0.1:4176";
function event(index: number): ClickRow {
  return {
    site: "skyline",
    app: null,
    environment: "production",
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    timestamp: Date.now() - index * 1000,
    page: `/page-${index}`,
    target: "button",
    label: `click-${index}`,
    ip: null,
    location: null,
  };
}
const rows = (start: number, length: number) =>
  Array.from({ length }, (_, index) => event(start + index));

test("separate routes load only their own report and preserve filters, reloads and history", async ({
  page,
}) => {
  // URLSearchParams.size is absent in older supported browsers.
  await page.addInitScript(() =>
    Object.defineProperty(URLSearchParams.prototype, "size", {
      value: undefined,
    }),
  );
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/"))
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto(admin);
  await expect(
    page.getByRole("heading", { name: "Click activity." }),
  ).toBeVisible();
  await expect(page.getByText("Private · admins only")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await expect(page.getByRole("table")).toHaveCount(0);
  expect(requests).toContain("/api/summary");
  expect(requests).not.toContain("/api/events");
  await page
    .getByRole("combobox", { name: "Site", exact: true })
    .selectOption("skyline");
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await page.screenshot({
    path: `test-results/overview-${test.info().project.name}.png`,
    fullPage: true,
  });

  requests.length = 0;
  await page.getByRole("link", { name: "Recent clicks", exact: true }).click();
  await expect(page).toHaveURL(`${admin}/recent?site=skyline&days=30`);
  await expect(
    page.getByRole("heading", { name: "Recent clicks." }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Recent clicks" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Recent clicks", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Activity over time" }),
  ).toHaveCount(0);
  expect(requests).toContain("/api/events");
  expect(requests).not.toContain("/api/summary");
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Click activity." }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Site", exact: true }),
  ).toHaveValue("skyline");
  await expect(
    page.getByRole("button", { name: "30 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  // Re-selecting the active range must not erase the loaded report.
  await expect(page.getByRole("table")).toBeVisible();
  await page.screenshot({
    path: `test-results/recent-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Recent clicks", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/recent-mobile-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Click activity." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("scrolling appends older pages once, removes overlaps, and stops at the end", async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  await page.route("**/api/events?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const cursor = query.get("cursor");
    await route.fulfill({
      json:
        cursor === "page-2"
          ? { events: rows(99, 101), nextCursor: "page-3" }
          : cursor === "page-3"
            ? { events: rows(199, 4), nextCursor: null }
            : { events: rows(0, 100), nextCursor: "page-2" },
    });
  });
  await page.goto(`${admin}/recent?site=skyline&days=30`);
  await expect(page.locator("tbody tr")).toHaveCount(100);
  expect(queries).toHaveLength(1);
  await page.locator(".pagination").scrollIntoViewIfNeeded();
  await expect(page.locator("tbody tr")).toHaveCount(200);
  await page.locator(".pagination").scrollIntoViewIfNeeded();
  await expect(page.locator("tbody tr")).toHaveCount(203);
  await expect(page.getByRole("status")).toContainText(
    "All clicks in this range are loaded.",
  );
  await expect(
    page.getByRole("button", { name: "Load more", exact: true }),
  ).toHaveCount(0);
  expect(queries.map((query) => query.get("cursor"))).toEqual([
    null,
    "page-2",
    "page-3",
  ]);
  for (const name of ["site", "from", "to"])
    expect(new Set(queries.map((query) => query.get(name))).size).toBe(1);
});

test("a failed page pauses automatic loading and supports keyboard retry", async ({
  page,
}) => {
  let pages = 0;
  await page.route("**/api/events?**", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("cursor")) {
      await route.fulfill({
        json: { events: rows(0, 1), nextCursor: "page-2" },
      });
    } else if (++pages === 1) {
      await route.fulfill({
        status: 503,
        json: { error: "Temporary failure" },
      });
    } else
      await route.fulfill({ json: { events: rows(1, 1), nextCursor: null } });
  });
  await page.goto(`${admin}/recent`);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.waitForTimeout(200); // An intersecting sentinel must not create a retry loop.
  expect(pages).toBe(1);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Retry loading more" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pages).toBe(2);
});

for (const action of [
  "refresh",
  "site filter",
  "date filter",
  "app filter",
  "environment filter",
] as const) {
  test(`${action} cancels pending pagination and replaces the old rows`, async ({
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
    let initial = 0;
    await page.route("**/api/events?**", async (route) => {
      if (new URL(route.request().url()).searchParams.has("cursor")) {
        started?.();
        await paused;
        await route
          .fulfill({ json: { events: rows(99, 1), nextCursor: null } })
          .catch(() => undefined);
      } else {
        const first = ++initial === 1;
        await route.fulfill({
          json: {
            events: rows(first ? 0 : 10, 1),
            nextCursor: first ? "page-2" : null,
          },
        });
      }
    });
    await page.goto(`${admin}/recent`);
    await requested;
    if (action === "refresh")
      await page.getByRole("button", { name: "Refresh data" }).click();
    else if (action === "site filter")
      await page
        .getByRole("combobox", { name: "Site", exact: true })
        .selectOption("skyline");
    else if (action === "app filter")
      await page
        .getByRole("combobox", { name: "App", exact: true })
        .selectOption("~unknown");
    else if (action === "environment filter")
      await page
        .getByRole("combobox", { name: "Environment", exact: true })
        .selectOption("staging");
    else
      await page.getByRole("button", { name: "30 days", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "click-10", exact: true }),
    ).toBeVisible();
    release?.();
    await page.waitForTimeout(100); // Let the cancelled response attempt settle.
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(
      page.getByRole("cell", { name: "click-99", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("manual pagination works without IntersectionObserver and empty results stop loading", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "IntersectionObserver", { value: undefined }),
  );
  let requests = 0;
  await page.route("**/api/events?**", async (route) => {
    requests++;
    const cursor = new URL(route.request().url()).searchParams.has("cursor");
    await route.fulfill({
      json: {
        events: rows(cursor ? 1 : 0, 1),
        nextCursor: cursor ? null : "page-2",
      },
    });
  });
  await page.goto(`${admin}/recent`);
  await expect(
    page.getByRole("button", { name: "Load more", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  expect(requests).toBe(2);
  await page.unroute("**/api/events?**");
  await page.route("**/api/events?**", (route) =>
    route.fulfill({ json: { events: [], nextCursor: null } }),
  );
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.getByRole("status")).toHaveText("No clicks to show.");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Load more", exact: true }),
  ).toHaveCount(0);
});

test("invalid URL filters recover to all sites and the default date range", async ({
  page,
}) => {
  await page.goto(`${admin}/recent?days=5&site=bogus`);
  await expect(page).toHaveURL(`${admin}/recent`);
  await expect(
    page.getByRole("table", { name: "Recent clicks" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Site", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "7 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const kind of ["repeated", "cyclic"] as const) {
  test(`${kind} pagination cursors stop loading until refresh`, async ({
    page,
  }) => {
    const requests: (string | null)[] = [];
    let initial = 0;
    await page.route("**/api/events?**", async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      requests.push(cursor);
      if (!cursor) {
        const first = ++initial === 1;
        await route.fulfill({
          json: {
            events: rows(first ? 0 : 10, 1),
            nextCursor: first ? "page-2" : null,
          },
        });
      } else
        await route.fulfill({
          json: {
            events: rows(cursor === "page-2" ? 1 : 2, 1),
            nextCursor:
              kind === "cyclic" && cursor === "page-2" ? "page-3" : "page-2",
          },
        });
    });
    await page.goto(`${admin}/recent`);
    await expect(page.getByRole("alert")).toContainText("Use Refresh data");
    await page.waitForTimeout(200); // A cursor loop must not keep issuing requests.
    expect(requests).toEqual(
      kind === "repeated" ? [null, "page-2"] : [null, "page-2", "page-3"],
    );
    await expect(page.locator("tbody tr")).toHaveCount(
      kind === "repeated" ? 1 : 2,
    );
    await expect(
      page.getByRole("button", { name: "Retry loading more" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh data" }).click();
    await expect(
      page.getByRole("cell", { name: "click-10", exact: true }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("overview retains its last successful report when a manual refresh fails", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/summary?**", async (route) => {
    requests++;
    if (requests === 2)
      await route.fulfill({
        status: 503,
        json: { error: "Temporary failure" },
      });
    else
      await route.fulfill({
        json: {
          totals: { clicks: requests === 1 ? 5 : 9, sites: 1, pages: 1 },
          daily: [],
          pages: [],
          targets: [],
        },
      });
  });
  await page.goto(admin);
  const total = page
    .locator(".metric")
    .filter({ hasText: "Total clicks" })
    .locator("strong");
  await expect(total).toHaveText("5");
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(total).toHaveText("5");
  await expect(page.locator(".updated")).toContainText("Updated");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(total).toHaveText("9");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
