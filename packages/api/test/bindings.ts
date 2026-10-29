import type { AdminEnv, Env, Sites } from "../src/env";
import { TEST_AUTH } from "./authHelpers";

/** A rate-limiter binding that allows every request, or refuses every one. */
export const rateLimit = (success = true): RateLimit => ({
  limit: async () => ({ success }),
});

/** The collector Worker's bindings, with a limiter that allows everything. */
export const collectorEnv = (DB: D1Database, SITES: Sites): Env => ({
  DB,
  SITES,
  INGEST_LIMITER: rateLimit(),
});

/** The admin Worker's bindings, with a limiter that allows everything. */
export const adminEnv = (
  DB: D1Database,
  SITES: Sites,
  ASSETS = {} as Fetcher,
): AdminEnv => ({
  ...TEST_AUTH,
  DB,
  SITES,
  READ_LIMITER: rateLimit(),
  ASSETS,
});
