import type { ClickRow, Summary } from "../packages/admin/src/data";
import { expect, test } from "./authenticated";

const admin = "http://127.0.0.1:4176";
const location = {
  continent: "NA",
  country: "US",
  region: "Texas",
  regionCode: "TX",
  city: "Austin",
  timezone: "America/Chicago",
};
const event = (id: number): ClickRow => ({
  site: "skyline",
  app: "skyline",
  environment: "staging",
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  timestamp: Date.now() - id * 1000,
  page: "/skyline-3d",
  target: "button",
  label: "skyline.wireframe",
  ip: "2001:db8::8",
  location,
});
const summary: Summary = {
  totals: { clicks: 3, sites: 1, pages: 1 },
  daily: [],
  pages: [{ site: "skyline", page: "/", clicks: 3 }],
  targets: [{ target: "button", label: null, clicks: 3 }],
  apps: [{ app: "skyline", clicks: 3 }],
  environments: [{ environment: "staging", clicks: 3 }],
  geography: {
    countries: [{ country: null, clicks: 3 }],
    regions: [{ country: "US", region: "Texas", regionCode: "TX", clicks: 3 }],
    cities: [{ ...location, clicks: 3 }],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "IntersectionObserver", { value: undefined }),
  );
  await page.route("**/api/summary?**", (route) =>
    route.fulfill({ json: summary }),
  );
});

test("overview rankings open scoped click lists that keep their scope while paging", async ({
  page,
}) => {
  const requests: URLSearchParams[] = [];
  await page.route("**/api/events?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    const more = query.has("cursor");
    return route.fulfill({
      json: { events: [event(more ? 2 : 1)], nextCursor: more ? null : "next" },
    });
  });
  await page.goto(`${admin}/?site=skyline&days=30&environment=all`);
  await page
    .getByRole("region", { name: "Cities", exact: true })
    .getByRole("link", { name: /Austin/ })
    .click();
  await expect(page).toHaveURL(
    `${admin}/recent?country=US&region=Texas&regionCode=TX&city=Austin&site=skyline&environment=all&days=30`,
  );
  await expect(page).toHaveTitle("Austin, Texas, United States · CT");
  await expect(
    page.getByRole("heading", { name: "Austin, Texas, United States." }),
  ).toBeVisible();
  await expect(page.locator("[aria-current=page]")).toHaveCount(0);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  for (const query of requests) {
    expect(query.get("site")).toBe("skyline");
    expect(query.get("environment")).toBe("");
    expect(query.get("country")).toBe("US");
    expect(query.get("region")).toBe("Texas");
    expect(query.get("regionCode")).toBe("TX");
    expect(query.get("city")).toBe("Austin");
  }
  expect(requests.map((query) => query.get("cursor"))).toEqual([null, "next"]);

  requests.length = 0;
  await page.getByRole("link", { name: "2001:db8::8" }).first().click();
  await expect(page).toHaveURL(
    `${admin}/recent?ip=2001%3Adb8%3A%3A8&site=skyline&environment=all&days=30`,
  );
  await expect(
    page.getByRole("heading", { name: "2001:db8::8." }),
  ).toBeVisible();
  expect(requests.at(-1)?.get("ip")).toBe("2001:db8::8");
  expect(requests.at(-1)?.has("city")).toBe(false);
  // Shared filters narrow the scope in place; navigation leaves the scope.
  await page
    .getByRole("combobox", { name: "Environment", exact: true })
    .selectOption("staging");
  await expect(page).toHaveURL(
    `${admin}/recent?ip=2001%3Adb8%3A%3A8&site=skyline&environment=staging&days=30`,
  );
  expect(requests.at(-1)?.get("ip")).toBe("2001:db8::8");
  await expect(
    page.getByRole("link", { name: "Recent clicks", exact: true }),
  ).toHaveAttribute("href", "/recent?site=skyline&environment=staging&days=30");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/drilldown-ip-mobile-${test.info().project.name}.png`,
    fullPage: true,
  });

  await page.goBack();
  await expect(page).toHaveURL(/city=Austin/);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Environment", exact: true }),
  ).toHaveValue("");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("each ranking links to the clicks it counts, including Unknown groups", async ({
  page,
}) => {
  const requests: URLSearchParams[] = [];
  await page.route("**/api/events?**", (route) => {
    requests.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { events: [], nextCursor: null } });
  });
  for (const [card, name, url, params] of [
    ["Apps", /skyline/, "/recent?app=skyline", { app: "skyline" }],
    [
      "Environments",
      /staging/,
      "/recent?environment=staging",
      { environment: "staging" },
    ],
    [
      "Countries",
      /Unknown country/,
      "/recent?country=%7Eunknown",
      { country: "~unknown" },
    ],
    [
      "States & regions",
      /Texas/,
      "/recent?country=US&region=Texas&regionCode=TX",
      { country: "US", region: "Texas", regionCode: "TX" },
    ],
    [
      "Top pages",
      /skyline/,
      "/recent?page=%2F&site=skyline",
      { site: "skyline", page: "/" },
    ],
    [
      "What gets clicked",
      /button/,
      "/recent?target=button&label=%7Eunknown",
      { target: "button", label: "~unknown" },
    ],
  ] as const) {
    await page.goto(admin);
    await page
      .locator("section.card")
      .filter({ has: page.getByRole("heading", { name: card, exact: true }) })
      .getByRole("link", { name })
      .click();
    await expect(page).toHaveURL(`${admin}${url}`);
    await expect(page.getByRole("status")).toHaveText("No clicks to show.");
    for (const [key, value] of Object.entries(params))
      expect(requests.at(-1)?.get(key)).toBe(value);
  }
});
