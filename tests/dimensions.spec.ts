import { expect, test } from "./authenticated";

const admin = "http://127.0.0.1:4176";
test("dimension filters default to production and persist through pages, pagination and reload", async ({
  page,
}) => {
  const requests: URL[] = [];
  await page.addInitScript(() =>
    Object.defineProperty(window, "IntersectionObserver", { value: undefined }),
  );
  await page.route("**/api/sites", (route) =>
    route.fulfill({
      json: {
        sites: ["a2f0-net", "devopsrockstars", "skyline"],
        apps: ["desktop", "skyline"],
      },
    }),
  );
  await page.route("**/api/summary?**", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        totals: { clicks: 7, sites: 1, pages: 1 },
        daily: [],
        pages: [],
        targets: [],
        apps: [{ app: "skyline", clicks: 7 }],
        environments: [{ environment: "staging", clicks: 7 }],
      },
    });
  });
  await page.route("**/api/events?**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const more = url.searchParams.has("cursor");
    return route.fulfill({
      json: {
        events: [
          {
            site: "devopsrockstars",
            id: more ? "two" : "one",
            timestamp: Date.now(),
            page: "/",
            target: "canvas",
            label: null,
            app: "skyline",
            environment: "staging",
            ip: null,
            location: null,
          },
        ],
        nextCursor: more ? null : "older",
      },
    });
  });
  await page.goto(admin);
  await expect(
    page.getByRole("combobox", { name: "Environment", exact: true }),
  ).toHaveValue("production");
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  expect(requests.at(-1)?.searchParams.get("environment")).toBe("production");
  await page
    .getByRole("combobox", { name: "Site", exact: true })
    .selectOption("devopsrockstars");
  await page
    .getByRole("combobox", { name: "App", exact: true })
    .selectOption("skyline");
  await page
    .getByRole("combobox", { name: "Environment", exact: true })
    .selectOption("staging");
  await expect(
    page.getByRole("region", { name: "Apps", exact: true }),
  ).toContainText("skyline");
  await expect(
    page.getByRole("region", { name: "Environments", exact: true }),
  ).toContainText("staging");
  await page.getByRole("link", { name: "Recent clicks", exact: true }).click();
  await expect(page).toHaveURL(
    `${admin}/recent?site=devopsrockstars&app=skyline&environment=staging`,
  );
  for (const name of ["App", "Environment"])
    await expect(
      page.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  const paging = requests.find((url) => url.searchParams.has("cursor"));
  expect(paging?.searchParams.get("app")).toBe("skyline");
  expect(paging?.searchParams.get("environment")).toBe("staging");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "App", exact: true }),
  ).toHaveValue("skyline");
  await expect(
    page.getByRole("combobox", { name: "Environment", exact: true }),
  ).toHaveValue("staging");
  await page
    .getByRole("combobox", { name: "Environment", exact: true })
    .selectOption("");
  await expect(page).toHaveURL(
    `${admin}/recent?site=devopsrockstars&app=skyline&environment=all`,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  expect(requests.at(-1)?.searchParams.get("environment")).toBe("");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/dimensions-mobile-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("valid apps outside the bounded dropdown remain selected with missing metadata", async ({
  page,
}) => {
  const app = "z".repeat(64);
  await page.route("**/api/sites", (route) =>
    route.fulfill({ json: { sites: ["skyline"], apps: [] } }),
  );
  await page.route("**/api/events?**", (route) =>
    route.fulfill({ json: { events: [], nextCursor: null } }),
  );
  await page.goto(`${admin}/recent?app=${app}`);
  await expect(
    page.getByRole("combobox", { name: "App", exact: true }),
  ).toHaveValue(app);
  await expect(
    page.getByRole("table", { name: "Recent clicks" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
