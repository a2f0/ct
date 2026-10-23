export type Environment = "production" | "staging";
export type Sites = Record<string, Record<string, Environment>>;

export interface Env {
  DB: D1Database;
  SITES: Sites;
  INGEST_LIMITER: RateLimit;
}

export interface AdminEnv {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  DB: D1Database;
  SITES: Sites;
  ASSETS: Fetcher;
  READ_LIMITER: RateLimit;
}

export function json(
  value: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

// Neither Worker serves pages meant for search results. Crawling stays
// allowed so that search engines can read this header.
export const NOINDEX = "noindex, nofollow";

export const RETENTION_DAYS = 90;
export const DAY = 86_400_000;
