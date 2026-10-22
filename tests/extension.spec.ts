import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";

test("extension blocks requests by default and toggles all open pages", async () => {
  const profile = await mkdtemp(resolve(tmpdir(), "ct-extension-"));
  const extension = resolve(
    import.meta.dirname,
    "../packages/extension/dist/chrome",
  );
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    const settings = await context.newPage();
    await settings.goto("chrome://extensions");
    const extensionId = await settings.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          chrome: {
            developerPrivate: {
              getExtensionsInfo(): Promise<{ id: string; name: string }[]>;
            };
          };
        }
      ).chrome;
      return (await api.developerPrivate.getExtensionsInfo()).find(
        (item) => item.name === "CT — Disable click tracking",
      )?.id;
    });
    expect(extensionId).toBeTruthy();
    await context.route("https://ct.a2f0.net/v1/clicks", (route) =>
      route.fulfill({
        status: 204,
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4174/?human=1");
    await page.waitForFunction(() => window.ready);
    await expect(page.locator("html")).toHaveAttribute("data-ct-disabled", "");
    expect(await page.evaluate(() => window.tracker.init())).toBe(false);
    expect(
      await page.evaluate(() =>
        fetch("https://ct.a2f0.net/v1/clicks", { mode: "no-cors" }).then(
          () => false,
          () => true,
        ),
      ),
    ).toBe(true);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole("checkbox")).toBeEnabled();
    await expect(popup.getByRole("checkbox")).toBeChecked();
    await popup.getByRole("checkbox").uncheck();
    await expect(page.locator("html")).not.toHaveAttribute("data-ct-disabled");
    expect(
      await page.evaluate(() =>
        fetch("https://ct.a2f0.net/v1/clicks", { mode: "no-cors" }).then(
          () => true,
          () => false,
        ),
      ),
    ).toBe(true);
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/v1/clicks") && response.status() === 202,
    );
    await page
      .getByRole("button", { name: "Open private building", exact: true })
      .click();
    await response;
    await popup.getByRole("checkbox").check();
    await expect(page.locator("html")).toHaveAttribute("data-ct-disabled", "");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-ct-disabled", "");
    await popup.screenshot({ path: "test-results/extension.png" });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
