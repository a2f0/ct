import type { Locator, Page } from "@playwright/test";
import type { ClickRow } from "../packages/admin/src/data";
import { expect, test } from "./authenticated";

const admin = "http://127.0.0.1:4176";
const ip = "203.0.113.8";
const event = (id: number, address: string | null): ClickRow => ({
  site: "skyline",
  app: "skyline",
  environment: "production",
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  timestamp: Date.now() - id * 1000,
  page: "/skyline-3d",
  target: "button",
  label: null,
  ip: address,
  location: null,
});
const ipLink = (page: Page) =>
  page.getByRole("cell").getByRole("link", { name: ip, exact: true });
const menu = (page: Page) =>
  page.getByRole("menu", { name: `Actions for ${ip}` });
/** Firefox reports whole-pixel pointer positions. */
const expectNear = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThan(1);
/** Waits out an entry animation, which fades and scales the element. */
const settled = (locator: Locator) =>
  locator.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
async function menuBox(page: Page) {
  await settled(menu(page));
  const box = await menu(page).boundingBox();
  if (!box) throw new Error("Menu is not visible");
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "IntersectionObserver", { value: undefined }),
  );
});

test("IP addresses open a styled menu from the pointer, keyboard and touch instead of the browser menu", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Array.prototype, "at", { value: undefined });
  });
  await page.route("**/api/events?**", (route) =>
    route.fulfill({
      json: { events: [event(1, ip), event(2, null)], nextCursor: null },
    }),
  );
  await page.goto(`${admin}/recent`);
  await page.evaluate(() => {
    const seen: boolean[] = [];
    Object.assign(window, { prevented: seen });
    // React handles the event at its root, before it bubbles to document.
    document.addEventListener("contextmenu", (event) =>
      seen.push(event.defaultPrevented),
    );
  });

  const link = ipLink(page);
  const box = await link.boundingBox();
  if (!box) throw new Error("IP link is not visible");
  await link.click({ button: "right", position: { x: 4, y: 4 } });
  await expect(menu(page)).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "prevented"))).toEqual([
    true,
  ]);
  const opened = await menuBox(page);
  expectNear(opened.x, box.x + 4);
  expectNear(opened.y, box.y + 4);
  const items = menu(page).getByRole("menuitem");
  await expect(items).toHaveText([
    "≡Show clicks from this IP",
    "⧉Copy IP address",
    "⊘Forget this IP…",
  ]);
  await expect(items.first()).toBeFocused();
  for (const [key, index] of [
    ["ArrowUp", 2],
    ["ArrowDown", 0],
    ["End", 2],
    ["Home", 0],
    ["ArrowDown", 1],
  ] as const) {
    await page.keyboard.press(key);
    await expect(items.nth(index)).toBeFocused();
  }
  await page.screenshot({
    path: `test-results/ip-menu-${test.info().project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(link).toBeFocused();

  // Keyboard menus open below the focused link; Tab moves on from it.
  for (const key of ["Shift+F10", "ContextMenu"]) {
    await link.focus();
    await page.keyboard.press(key);
    expectNear((await menuBox(page)).y, box.y + box.height);
    await page.keyboard.press("Tab");
    await expect(menu(page)).toHaveCount(0);
    await expect(link).not.toBeFocused();
  }

  await link.click({ button: "right" });
  await page.getByRole("heading", { name: "Recent clicks." }).click();
  await expect(menu(page)).toHaveCount(0);

  // Near the window corner, the menu stays fully visible.
  await page.setViewportSize({ width: 390, height: 844 });
  // Let the resize event, which closes open menus, arrive first.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => setTimeout(done))),
  );
  await link.dispatchEvent("contextmenu", { clientX: 389, clientY: 843 });
  const clamped = await menuBox(page);
  expectNear(clamped.x + clamped.width, 382);
  expectNear(clamped.y + clamped.height, 836);
  await page.keyboard.press("Escape");
  await link.scrollIntoViewIfNeeded();

  // A touch long press opens the menu and swallows the click on release.
  const touch = await link.boundingBox();
  if (!touch) throw new Error("IP link is not visible");
  const point = {
    pointerType: "touch",
    isPrimary: true,
    clientX: touch.x + 4,
    clientY: touch.y + 4,
  };
  await link.dispatchEvent("pointerdown", point);
  await link.dispatchEvent("pointerup", point);
  await page.waitForTimeout(700);
  await expect(menu(page)).toHaveCount(0);
  await link.dispatchEvent("pointerdown", point);
  await expect(menu(page)).toBeVisible();
  await link.dispatchEvent("pointerup", point);
  await link.dispatchEvent("click");
  await expect(page).toHaveURL(`${admin}/recent`);
  await page.keyboard.press("Escape");

  // Clicks without an address keep the browser menu.
  await page
    .locator(".ip-address")
    .getByRole("link", { name: "Unknown", exact: true })
    .click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);

  // A new press on an IP closes its menu and follows the link as usual.
  const end = await link.boundingBox();
  await link.click({
    button: "right",
    position: { x: (end?.width ?? 2) - 2, y: 4 },
  });
  await expect(menu(page)).toBeVisible();
  await link.click({ position: { x: 2, y: 4 } });
  await expect(page).toHaveURL(`${admin}/recent?ip=${ip}`);
});

test("forgetting an IP needs confirmation, reports errors in place, then refreshes the list", async ({
  page,
}) => {
  let forgotten = false;
  await page.route("**/api/events?**", (route) =>
    route.fulfill({
      json: {
        events: forgotten ? [event(2, null)] : [event(1, ip), event(2, null)],
        nextCursor: null,
      },
    }),
  );
  const posts: { method: string; type: string | null; body: unknown }[] = [];
  let release = () => {};
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/forget", async (route) => {
    const request = route.request();
    posts.push({
      method: request.method(),
      type: await request.headerValue("Content-Type"),
      body: request.postDataJSON(),
    });
    if (posts.length === 1) return route.fulfill({ status: 503, json: {} });
    await finished;
    forgotten = true;
    return route.fulfill({ json: { ip, deleted: 3 } });
  });
  await page.goto(`${admin}/recent?site=skyline`);
  const link = ipLink(page);
  const dialog = page.getByRole("alertdialog", { name: `Forget ${ip}?` });

  await link.click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Forget this IP…" }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(
    /across all sites, apps, environments and dates/,
  );
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(link).toBeFocused();

  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(posts).toEqual([]);

  await link.click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Forget this IP…" }).click();
  await settled(dialog);
  await page.screenshot({
    path: `test-results/forget-dialog-dark-${test.info().project.name}.png`,
  });
  const confirm = dialog.getByRole("button", { name: "Forget IP address" });
  await confirm.click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Could not forget this IP address. Please try again.",
  );
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    dialog.getByRole("button", { name: "Forgetting…" }),
  ).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").first()).toHaveText(
    `Forgot ${ip}: 3 clicks deleted. Dismiss`,
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(ipLink(page)).toHaveCount(0);
  expect(posts).toEqual([
    { method: "POST", type: "application/json", body: { ip } },
    { method: "POST", type: "application/json", body: { ip } },
  ]);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".notice")).toHaveCount(0);
});

test("the dialog follows the light theme", async ({ page }) => {
  await page.route("**/api/events?**", (route) =>
    route.fulfill({ json: { events: [event(1, ip)], nextCursor: null } }),
  );
  await page.goto(`${admin}/recent`);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await ipLink(page).click({ button: "right" });
  await settled(menu(page));
  await page.screenshot({
    path: `test-results/ip-menu-light-${test.info().project.name}.png`,
  });
  await menu(page).getByRole("menuitem", { name: "Forget this IP…" }).click();
  const dialog = page.getByRole("alertdialog", { name: `Forget ${ip}?` });
  await expect(dialog).toBeVisible();
  const colors = await dialog
    .getByRole("button", { name: "Forget IP address" })
    .evaluate((button) => {
      const style = getComputedStyle(button);
      return [style.backgroundColor, style.color];
    });
  expect(colors).toEqual(["rgb(165, 38, 32)", "rgb(255, 255, 255)"]);
  await settled(dialog);
  await page.screenshot({
    path: `test-results/forget-dialog-light-${test.info().project.name}.png`,
  });
});

test("the Worker forgets only same-origin JSON requests from a signed-in session", async ({
  page,
  playwright,
}) => {
  const unused = "192.0.2.250";
  const forget = (headers: Record<string, string>) =>
    page.request.post(`${admin}/api/forget`, { headers, data: { ip: unused } });
  const accepted = await forget({ Origin: admin });
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({ ip: unused, deleted: 0 });
  expect((await forget({})).status()).toBe(403);
  expect((await forget({ Origin: "https://evil.example" })).status()).toBe(403);
  expect((await page.request.get(`${admin}/api/forget`)).status()).toBe(405);
  // The fixture's signed-in state applies unless a context opts out.
  const anonymous = await playwright.request.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const denied = await anonymous.post(`${admin}/api/forget`, {
    headers: { Origin: admin },
    data: { ip: unused },
  });
  expect(denied.status()).toBe(401);
  await anonymous.dispose();
});
