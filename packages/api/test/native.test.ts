import { afterEach, beforeEach, expect, test } from "bun:test";
import { provisionAccount } from "../src/accounts";
import { admin } from "../src/admin";
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
    ASSETS: { fetch: async () => new Response("shell") } as unknown as Fetcher,
  };
  await provisionAccount(env.DB, { action: "create", ...TEST_ACCOUNT });
});
afterEach(() => storage.sqlite.close());

// Native HTTP sends no Origin; only the headers given here reach the Worker.
function call(
  path: string,
  headers: Record<string, string>,
  { method = "POST", body = {} as unknown, cookie = "" } = {},
) {
  return admin(
    new Request(`${TEST_AUTH.BETTER_AUTH_URL}${path}`, {
      method,
      headers: {
        ...headers,
        ...(cookie ? { Cookie: cookie } : {}),
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.9",
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
}
const signIn = (headers: Record<string, string>) =>
  call("/api/auth/sign-in/email", headers, {
    body: { email: TEST_ACCOUNT.email, password: TEST_ACCOUNT.password },
  });

test("the app shell's marker stands in for the dashboard origin on every mutation", async () => {
  for (const marker of ["capacitor://localhost", "https://localhost"]) {
    const native = { "X-CT-Native-Origin": marker };
    const response = await signIn(native);
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).not.toBe("");
    expect(
      (await call("/api/sites", native, { method: "GET", cookie })).status,
    ).toBe(200);
    const forgotten = await call("/api/forget", native, {
      body: { ip: "203.0.113.8" },
      cookie,
    });
    expect(forgotten.status).toBe(200);
    expect(
      (
        await call("/api/auth/change-password", native, {
          body: {
            currentPassword: TEST_ACCOUNT.password,
            newPassword: TEST_ACCOUNT.password,
          },
          cookie,
        })
      ).status,
    ).toBe(200);
    expect((await call("/api/auth/sign-out", native, { cookie })).status).toBe(
      200,
    );
    expect(
      (await call("/api/sites", native, { method: "GET", cookie })).status,
    ).toBe(401);
  }
});

test("the marker is not authentication and never overrides a browser origin", async () => {
  expect(
    (
      await call(
        "/api/sites",
        { "X-CT-Native-Origin": "https://localhost" },
        { method: "GET" },
      )
    ).status,
  ).toBe(401);
  expect((await signIn({})).status).toBe(403);
  for (const origin of ["https://evil.example", "null", ""])
    expect(
      (
        await signIn({
          Origin: origin,
          "X-CT-Native-Origin": "capacitor://localhost",
        })
      ).status,
    ).toBe(403);
  for (const marker of [
    "https://evil.example",
    "capacitor://evil.example",
    "https://localhost:8443",
    "http://localhost",
    TEST_AUTH.BETTER_AUTH_URL,
  ])
    expect((await signIn({ "X-CT-Native-Origin": marker })).status).toBe(403);
  expect(
    storage.sqlite.query("SELECT COUNT(*) AS n FROM auth_session").get(),
  ).toEqual({ n: 0 });
});
