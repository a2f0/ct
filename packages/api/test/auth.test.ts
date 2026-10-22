import { afterEach, beforeEach, expect, test } from "bun:test";
import { getMigrations } from "better-auth/db/migration";
import { provisionAccount } from "../src/accounts";
import { admin } from "../src/admin";
import { createAuth } from "../src/auth";
import type { AdminEnv } from "../src/env";
import { TEST_ACCOUNT, TEST_AUTH } from "./authHelpers";
import { database } from "./database";

let storage: Awaited<ReturnType<typeof database>>;
let env: AdminEnv;
beforeEach(async () => {
  storage = await database();
  env = {
    ...TEST_AUTH,
    DB: storage.db,
    SITES: { skyline: { "https://skyline.devopsrockstars.com": "production" } },
    READ_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: {
      fetch: async () =>
        new Response("<html>shell</html>", {
          headers: { "Content-Type": "text/html" },
        }),
    } as unknown as Fetcher,
  };
});
afterEach(() => storage.sqlite.close());
function call(
  path: string,
  {
    method = "GET",
    body,
    cookie = "",
    origin = TEST_AUTH.BETTER_AUTH_URL,
    ip = "203.0.113.5",
  }: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
    ip?: string;
  } = {},
) {
  return admin(
    new Request(`${TEST_AUTH.BETTER_AUTH_URL}${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
        "CF-Connecting-IP": ip,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}
const login = (password = TEST_ACCOUNT.password) =>
  call("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: TEST_ACCOUNT.email, password },
  });
function cookieOf(response: Response) {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Missing session cookie");
  return cookie;
}

test("migrated schema matches installed Better Auth including direct D1 adapter indexes", async () => {
  const plan = await getMigrations(createAuth(env).options);
  expect(plan.toBeCreated).toEqual([]);
  expect(plan.toBeAdded).toEqual([]);
  expect(plan.toBeAddedIndexes).toEqual([]);
  expect(plan.schemaProblems).toEqual([]);
  expect(plan.unsafeChanges).toEqual([]);
});
test("all analytics API methods deny unauthenticated access; deep links redirect and login remains public", async () => {
  for (const path of [
    "/api/sites",
    "/api/summary",
    "/api/events",
    "/api/unknown",
  ])
    for (const method of [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]) {
      const response = await call(path, { method });
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain("skyline");
    }
  const page = await call("/recent?app=skyline&environment=staging");
  expect(page.status).toBe(302);
  expect(page.headers.get("Location")).toBe(
    "/login?returnTo=%2Frecent%3Fapp%3Dskyline%26environment%3Dstaging",
  );
  expect((await call("/login")).status).toBe(200);
  expect((await call("/login")).headers.get("Cache-Control")).toBe(
    "private, no-store, no-transform",
  );
});
test("missing signing secret fails closed without disclosing private data", async () => {
  env.BETTER_AUTH_SECRET = "";
  for (const path of [
    "/",
    "/recent",
    "/api/sites",
    "/api/events",
    "/api/summary",
    "/api/auth/get-session",
  ]) {
    const response = await call(path);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.text()).not.toContain("skyline");
  }
  expect((await call("/login")).status).toBe(200);
});
test("signup is disabled in routing and in the auth library; mutation origins and media types are enforced", async () => {
  expect(
    (
      await call("/api/auth/sign-up/email", {
        method: "POST",
        body: TEST_ACCOUNT,
      })
    ).status,
  ).toBe(404);
  const direct = await createAuth(env).handler(
    new Request(`${TEST_AUTH.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        Origin: TEST_AUTH.BETTER_AUTH_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(TEST_ACCOUNT),
    }),
  );
  expect(direct.status).toBe(400);
  for (const origin of ["https://evil.example", ""])
    expect(
      (
        await call("/api/auth/sign-in/email", {
          method: "POST",
          origin,
          body: TEST_ACCOUNT,
        })
      ).status,
    ).toBe(403);
  expect(
    (
      await call("/api/auth/request-password-reset", {
        method: "POST",
        body: TEST_ACCOUNT,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call("/api/auth/sign-in/email", {
        method: "POST",
        body: { padding: "a".repeat(9000) },
      })
    ).status,
  ).toBe(400);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS n FROM auth_user").get(),
  ).toEqual({ n: 0 });
});
test("provisioned accounts sign in with secure cookies, read data, revoke on logout, and reject expired sessions", async () => {
  await provisionAccount(env.DB, { action: "create", ...TEST_ACCOUNT });
  const response = await login();
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Lax");
  expect(setCookie).not.toContain("Domain=");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  const cookie = cookieOf(response);
  expect((await call("/api/sites", { cookie })).status).toBe(200);
  for (const method of ["POST", "PUT", "DELETE"])
    expect((await call("/api/events", { cookie, method })).status).toBe(405);
  expect(
    (await call("/api/auth/sign-out", { method: "POST", body: {}, cookie }))
      .status,
  ).toBe(200);
  expect((await call("/api/events", { cookie })).status).toBe(401);
  const next = cookieOf(await login());
  storage.sqlite.exec(
    "UPDATE auth_session SET expiresAt='2000-01-01T00:00:00.000Z'",
  );
  expect((await call("/api/events", { cookie: next })).status).toBe(401);
});
test("password changes revoke other sessions and CLI recovery revokes every existing session", async () => {
  await provisionAccount(env.DB, { action: "create", ...TEST_ACCOUNT });
  const first = cookieOf(await login());
  const second = cookieOf(await login());
  const newPassword = "changed-password-0002";
  const changed = await call("/api/auth/change-password", {
    method: "POST",
    cookie: first,
    body: {
      currentPassword: TEST_ACCOUNT.password,
      newPassword,
      revokeOtherSessions: false,
    },
  });
  expect(changed.status).toBe(200);
  expect((await call("/api/events", { cookie: second })).status).toBe(401);
  expect((await login(TEST_ACCOUNT.password)).status).toBe(401);
  const current = cookieOf(await login(newPassword));
  await provisionAccount(env.DB, {
    action: "reset",
    email: TEST_ACCOUNT.email,
    password: "reset-password-0003",
  });
  expect((await call("/api/events", { cookie: current })).status).toBe(401);
  expect((await login("reset-password-0003")).status).toBe(200);
});
test("login rate limiting is persistent and account creation is atomic", async () => {
  for (let i = 0; i < 5; i++) expect((await login()).status).toBe(401);
  expect((await login()).status).toBe(429);
  expect(
    (
      storage.sqlite
        .query("SELECT COUNT(*) AS n FROM auth_rate_limit")
        .get() as { n: number }
    ).n,
  ).toBeGreaterThan(0);
  storage.sqlite.exec(
    "CREATE TRIGGER reject_account BEFORE INSERT ON auth_account BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END",
  );
  await expect(
    provisionAccount(env.DB, { action: "create", ...TEST_ACCOUNT }),
  ).rejects.toThrow();
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS n FROM auth_user").get(),
  ).toEqual({ n: 0 });
});
