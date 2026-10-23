import { provisionAccount } from "../src/accounts";
import { createAuth } from "../src/auth";
import type { AdminEnv } from "../src/env";

export const TEST_AUTH = {
  BETTER_AUTH_URL: "https://ct-admin.a2f0.net",
  BETTER_AUTH_SECRET: "ct-isolated-unit-test-secret-never-for-production-0001",
};
export const TEST_ACCOUNT = {
  email: "admin@example.test",
  name: "Test administrator",
  password: "local-test-password-0001",
};
export async function authenticateTestAccount(db: D1Database) {
  await provisionAccount(db, { action: "create", ...TEST_ACCOUNT });
  const auth = createAuth({ ...TEST_AUTH, DB: db } as AdminEnv);
  const response = await auth.handler(
    new Request(`${TEST_AUTH.BETTER_AUTH_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        Origin: TEST_AUTH.BETTER_AUTH_URL,
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.1",
      },
      body: JSON.stringify(TEST_ACCOUNT),
    }),
  );
  if (response.status !== 200)
    throw new Error(
      `Fixture sign-in failed: ${response.status} ${await response.text()}`,
    );
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Fixture session cookie missing");
  return cookie;
}
