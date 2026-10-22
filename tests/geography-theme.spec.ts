import { expect, test } from "@playwright/test";
import type { ClickRow, Summary } from "../packages/admin/src/data";

const admin = "http://127.0.0.1:4176";
const location = {
  continent: "NA",
  country: "US",
  region: "Texas",
  regionCode: "TX",
  city: "Austin",
  timezone: "America/Chicago",
};
const event: ClickRow = {
  site: "skyline",
  id: "00000000-0000-4000-8000-000000000001",
  timestamp: Date.now(),
  page: "/",
  target: "button",
  label: "skyline.wireframe",
  ip: "2001:db8::8",
  location,
};
const summary: Summary = {
  totals: { clicks: 3, sites: 1, pages: 1 },
  daily: [],
  pages: [{ site: "skyline", page: "/", clicks: 3 }],
  targets: [{ target: "button", label: "skyline.wireframe", clicks: 3 }],
  geography: {
    countries: [
      { country: "US", clicks: 2 },
      { country: null, clicks: 1 },
    ],
    regions: [
      { country: "US", region: "Texas", regionCode: "TX", clicks: 2 },
      { country: null, region: null, regionCode: null, clicks: 1 },
    ],
    cities: [
      {
        country: "US",
        region: "Texas",
        regionCode: "TX",
        city: "Austin",
        clicks: 2,
      },
      { country: null, region: null, regionCode: null, city: null, clicks: 1 },
    ],
  },
};

test("recent clicks show IP/location and overview slices countries, regions and cities", async ({
  page,
}) => {
  await page.route("**/api/events?**", (route) =>
    route.fulfill({
      json: {
        events: [
          event,
          {
            ...event,
            id: "00000000-0000-4000-8000-000000000002",
            ip: null,
            location: null,
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await page.route("**/api/summary?**", (route) =>
    route.fulfill({ json: summary }),
  );
  await page.goto(`${admin}/recent`);
  await expect(
    page.getByRole("columnheader", { name: "IP address" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "2001:db8::8", exact: true }),
  ).toBeVisible();
  const place = page.locator(".event-location").first();
  await expect(place).toContainText("Austin, Texas");
  await expect(place).toContainText("United States · NA");
  await expect(place).toContainText("America/Chicago");
  await expect(page.locator(".event-location").last()).toHaveText("Unknown");
  await expect(page.locator(".ip-address").last()).toHaveText("Unknown");
  await page.screenshot({
    path: `test-results/recent-geo-dark-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  for (const [name, text] of [
    ["Countries", "United States"],
    ["States & regions", "Texas"],
    ["Cities", "Austin"],
  ] as const) {
    const group = page.getByRole("region", { name, exact: true });
    await expect(group).toContainText(text ?? "");
    await expect(group).toContainText("Unknown");
    await expect(group.locator(".rank b").first()).toHaveText("2");
  }
  await page.screenshot({
    path: `test-results/overview-geo-dark-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 1024 });
  await page.screenshot({
    path: `test-results/overview-geo-tablet-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/overview-geo-mobile-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("Graphite defaults to dark and the keyboard theme switch persists through routes and reloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/summary?**", (route) =>
    route.fulfill({ json: summary }),
  );
  await page.goto(admin);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(page.locator(".metric").first()).toHaveCSS(
    "background-color",
    "rgb(22, 22, 22)",
  );
  await page.getByRole("button", { name: "Switch to light mode" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(238, 238, 238)",
  );
  expect(await page.evaluate(() => localStorage.getItem("ct.theme"))).toBe(
    "light",
  );
  await page.screenshot({
    path: `test-results/overview-geo-light-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Recent clicks", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});

test("theme controls work when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", {
      value: () => {
        throw new Error("blocked");
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      value: () => {
        throw new Error("blocked");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(admin);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});
