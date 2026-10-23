import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: "firefoxExtension.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: "extension.spec.ts",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: [
    {
      command:
        "bun scripts/testing/browserPrepare.ts && bunx --no-install wrangler dev --config tests/wrangler.api.json --port 4175",
      url: "http://127.0.0.1:4175/health",
      timeout: 120_000,
    },
    {
      command:
        "bunx --no-install wrangler dev --config tests/wrangler.admin.json --port 4176",
      url: "http://127.0.0.1:4176/login",
      timeout: 120_000,
    },
    {
      command: "bun tests/fixtureServer.ts",
      url: "http://127.0.0.1:4174",
      timeout: 30_000,
    },
  ],
});
