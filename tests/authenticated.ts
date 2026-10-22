import type { BrowserContext } from "@playwright/test";
import { test as base, expect } from "@playwright/test";

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
export const test = base.extend<Record<never, never>, { authState: State }>({
  authState: [
    async ({ playwright }, use, workerInfo) => {
      const context = await playwright.request.newContext({
        extraHTTPHeaders: {
          "CF-Connecting-IP":
            workerInfo.project.name === "firefox"
              ? "203.0.113.21"
              : "203.0.113.20",
        },
      });
      const response = await context.post(
        "http://127.0.0.1:4176/api/auth/sign-in/email",
        {
          headers: { Origin: "http://127.0.0.1:4176" },
          data: {
            email: "browser@example.test",
            password: "isolated-browser-password-0001",
          },
        },
      );
      expect(response.status()).toBe(200);
      await use(await context.storageState());
      await context.dispose();
    },
    { scope: "worker" },
  ],
  storageState: async ({ authState }, use) => use(authState),
});
export { expect };
