import { betterAuth } from "better-auth";
import type { AdminEnv } from "./env";

function buildAuth(env: AdminEnv) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("Admin authentication is not configured");
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  return betterAuth({
    appName: "CT Admin",
    baseURL: origin,
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    logger: { disabled: true },
    advanced: {
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      cookiePrefix: "ct-admin",
      useSecureCookies: origin.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    user: { modelName: "auth_user" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    session: {
      modelName: "auth_session",
      expiresIn: 8 * 60 * 60,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limit",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
  });
}

const instances = new WeakMap<
  D1Database,
  { secret: string; url: string; auth: ReturnType<typeof buildAuth> }
>();
export function createAuth(env: AdminEnv) {
  const existing = instances.get(env.DB);
  if (
    existing?.secret === env.BETTER_AUTH_SECRET &&
    existing.url === env.BETTER_AUTH_URL
  )
    return existing.auth;
  const auth = buildAuth(env);
  instances.set(env.DB, {
    secret: env.BETTER_AUTH_SECRET,
    url: env.BETTER_AUTH_URL,
    auth,
  });
  return auth;
}
