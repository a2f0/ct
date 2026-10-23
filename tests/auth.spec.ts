import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const admin = "http://127.0.0.1:4176";
const initialPassword = "isolated-auth-initial-🐈0001";
const changedPassword = "isolated-auth-changed-0002";
const resetPassword = "isolated-auth-reset-0003";

async function account(
  action: "create" | "reset",
  email: string,
  password: string,
) {
  const logDirectory = await mkdtemp(join(tmpdir(), "ct-cli-test-logs-"));
  const child = spawn(
    "node",
    [
      "scripts/admin/adminUser.ts",
      action,
      "--local",
      "--config",
      "tests/wrangler.api.json",
      "--email",
      email,
      "--password-stdin",
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        FORCE_COLOR: undefined,
        WRANGLER_LOG: "debug",
        WRANGLER_WRITE_LOGS: "true",
        WRANGLER_LOG_SANITIZE: "false",
        WRANGLER_LOG_PATH: logDirectory,
      },
    },
  );
  child.stdin.write(`${password}\n`);
  child.stdin.end();
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("close", resolve);
    child.on("error", reject);
  });
  // Report only booleans on failure: credentials must not enter trace output.
  expect(output.includes(password)).toBe(false);
  const logs = await readdir(logDirectory);
  await rm(logDirectory, { recursive: true, force: true });
  expect(logs).toEqual([]);
  expect(code).toBe(0);
  const expected =
    action === "create"
      ? "Administrator account created."
      : "Password reset; all existing sessions revoked.";
  expect(output.trim() === expected).toBe(true);
}
// Record PasswordCredential saves in both engines; Firefox lacks the API.
async function recordSavedPasswords(
  page: Page,
  outcome: "saved" | "rejected" = "saved",
) {
  const saved: { id: string; password: string }[] = [];
  await page.exposeFunction(
    "ctRecordSavedPassword",
    (id: string, password: string) => saved.push({ id, password }),
  );
  await page.addInitScript((outcome) => {
    const record = (
      window as unknown as {
        ctRecordSavedPassword: (id: string, password: string) => Promise<void>;
      }
    ).ctRecordSavedPassword;
    class PasswordCredential {
      id: string;
      password: string;
      constructor(data: { id: string; password: string }) {
        this.id = data.id;
        this.password = data.password;
      }
    }
    Object.defineProperty(window, "PasswordCredential", {
      value: PasswordCredential,
      configurable: true,
    });
    Object.defineProperty(navigator.credentials, "store", {
      value: async (credential: PasswordCredential) => {
        await record(credential.id, credential.password);
        if (outcome === "rejected")
          throw new DOMException("Saving declined", "NotAllowedError");
        return credential;
      },
      configurable: true,
    });
  }, outcome);
  return saved;
}
async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Click activity\.|Recent clicks\./ }),
  ).toBeVisible();
}

test("unauthenticated Worker denies every data method, redirects deep links, and has no registration", async ({
  page,
  request,
}, info) => {
  for (const path of ["/api/sites", "/api/summary", "/api/events"]) {
    for (const method of [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]) {
      const response = await request.fetch(`${admin}${path}`, { method });
      expect(response.status()).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect((await response.text()).includes("skyline")).toBe(false);
    }
  }
  const signup = await request.post(`${admin}/api/auth/sign-up/email`, {
    headers: { Origin: admin },
    data: {
      email: "forbidden@example.test",
      password: initialPassword,
      name: "Forbidden",
    },
  });
  expect(signup.status()).toBe(404);
  const crossOrigin = await request.post(`${admin}/api/auth/sign-in/email`, {
    headers: { Origin: "https://evil.example" },
    data: { email: "forbidden@example.test", password: initialPassword },
  });
  expect(crossOrigin.status()).toBe(403);
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(sites|events|summary)/.test(request.url()))
      dataRequests.push(request.url());
  });
  await page.goto(`${admin}/recent?site=skyline&environment=staging`);
  await expect(page).toHaveURL(
    `${admin}/login?returnTo=${encodeURIComponent("/recent?site=skyline&environment=staging")}`,
  );
  await expect(page.getByRole("heading", { name: "Sign in." })).toBeVisible();
  const icons = await page.evaluate(() =>
    Promise.all(
      Array.from(
        document.querySelectorAll<HTMLLinkElement>(
          'link[rel="icon"], link[rel="apple-touch-icon"]',
        ),
        async (link) => {
          const response = await fetch(link.href, { redirect: "manual" });
          return {
            path: new URL(link.href).pathname,
            status: response.status,
            type: response.headers.get("Content-Type") ?? "",
            bytes: (await response.arrayBuffer()).byteLength,
          };
        },
      ),
    ),
  );
  expect(icons.map(({ path }) => path)).toEqual([
    "/favicon.ico",
    "/favicon.svg",
    "/apple-touch-icon.png",
  ]);
  for (const icon of icons) {
    expect(icon.status).toBe(200);
    expect(icon.type).toMatch(/^image\//);
    expect(icon.bytes).toBeGreaterThan(0);
  }
  const emailField = page.getByLabel("Email", { exact: true });
  await expect(emailField).toHaveAttribute("name", "email");
  await expect(emailField).toHaveAttribute("autocomplete", "username");
  const passwordField = page.getByLabel("Password", { exact: true });
  await expect(passwordField).toHaveAttribute("name", "password");
  await expect(passwordField).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(
    page.getByRole("button", { name: /register|sign up/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /register|sign up/i }),
  ).toHaveCount(0);
  expect(dataRequests).toEqual([]);
  await page.screenshot({
    path: `test-results/login-dark-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `test-results/login-light-mobile-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("CLI accounts log in, change passwords, logout, reset and clear expired private state", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000);
  const email = `auth-${info.project.name}-${crypto.randomUUID()}@example.test`;
  await account("create", email, initialPassword);
  await context.setExtraHTTPHeaders({
    "CF-Connecting-IP":
      info.project.name === "chromium" ? "203.0.113.31" : "203.0.113.32",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await recordSavedPasswords(page);
  await page.goto(`${admin}/recent?site=skyline&environment=staging`);
  await signIn(page, email, initialPassword);
  // Compare in Node so failures report booleans rather than credentials.
  expect(saved.length).toBe(1);
  expect(saved[0]?.id === email).toBe(true);
  expect(saved[0]?.password === initialPassword).toBe(true);
  await expect(page).toHaveURL(
    `${admin}/recent?site=skyline&environment=staging`,
  );
  await expect(
    page.getByRole("combobox", { name: "Environment", exact: true }),
  ).toHaveValue("staging");
  const duringReturn: string[] = [];
  const capture = (request: import("@playwright/test").Request) => {
    if (/\/api\/(summary|events)/.test(request.url()))
      duringReturn.push(new URL(request.url()).pathname);
  };
  page.on("request", capture);
  await page.goto(
    `${admin}/login?returnTo=${encodeURIComponent("/recent?site=skyline&environment=staging")}`,
  );
  await expect(page).toHaveURL(
    `${admin}/recent?site=skyline&environment=staging`,
  );
  await expect(
    page.getByRole("table", { name: "Recent clicks" }),
  ).toBeVisible();
  expect(duringReturn).not.toContain("/api/summary");
  page.off("request", capture);
  for (const returnTo of [
    "https://evil.example/recent",
    "//evil.example/recent",
    "/\\evil.example/recent",
    "/api/sites",
    "/login",
  ]) {
    await page.goto(`${admin}/login?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(page).toHaveURL(`${admin}/`);
    await expect(
      page.getByRole("heading", { name: "Click activity." }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.locator('input[autocomplete="username"]')).toHaveValue(
    email,
  );
  await page
    .getByLabel("Current password", { exact: true })
    .fill(initialPassword);
  await page.getByLabel("New password", { exact: true }).fill(changedPassword);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(changedPassword);
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Password changed. Other sessions have been signed out.",
  );
  expect(saved.length).toBe(2);
  expect(saved[1]?.id === email).toBe(true);
  expect(saved[1]?.password === changedPassword).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in." })).toBeVisible();
  expect((await context.request.get(`${admin}/api/sites`)).status()).toBe(401);
  await signIn(page, email, changedPassword);
  await page.getByRole("link", { name: "Recent clicks", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Recent clicks" }),
  ).toBeVisible();
  await account("reset", email, resetPassword);
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.getByRole("heading", { name: "Sign in." })).toBeVisible();
  await expect(
    page.getByText("Your session expired. Sign in again to continue."),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  expect((await context.request.get(`${admin}/api/sites`)).status()).toBe(401);
  await signIn(page, email, resetPassword);
  await expect(page).toHaveURL(`${admin}/recent`);
  expect((await context.request.get(`${admin}/api/events`)).status()).toBe(200);
  expect((await context.request.post(`${admin}/api/events`)).status()).toBe(
    405,
  );
  expect(errors).toEqual([]);
});

for (const outcome of ["missing", "rejected"] as const) {
  test(`sign-in and password changes finish when credential saving is ${outcome}`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(60_000);
    const email = `saving-${outcome}-${info.project.name}-${crypto.randomUUID()}@example.test`;
    await account("create", email, initialPassword);
    await context.setExtraHTTPHeaders({
      "CF-Connecting-IP": `203.0.113.${(outcome === "missing" ? 41 : 43) + (info.project.name === "chromium" ? 0 : 1)}`,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const saved =
      outcome === "rejected" ? await recordSavedPasswords(page, outcome) : [];
    if (outcome === "missing")
      await page.addInitScript(() => {
        delete (window as { PasswordCredential?: unknown }).PasswordCredential;
      });
    await page.goto(`${admin}/`);
    expect(await page.evaluate(() => "PasswordCredential" in window)).toBe(
      outcome === "rejected",
    );
    await signIn(page, email, initialPassword);
    await page.getByRole("link", { name: "Account", exact: true }).click();
    await page
      .getByLabel("Current password", { exact: true })
      .fill(initialPassword);
    await page
      .getByLabel("New password", { exact: true })
      .fill(changedPassword);
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill(changedPassword);
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Password changed. Other sessions have been signed out.",
    );
    expect(saved.length).toBe(outcome === "rejected" ? 2 : 0);
    expect(errors).toEqual([]);
  });
}

test("sign-in service errors are distinguished from invalid credentials", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Authentication temporarily unavailable" },
    }),
  );
  await page.goto(`${admin}/login`);
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Sign-in is temporarily unavailable. Please try again.",
  );
});
