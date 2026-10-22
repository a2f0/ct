export interface Env {
  DB: D1Database;
  SITES: Record<string, string[]>;
  INGEST_LIMITER: RateLimit;
}

export interface AdminEnv {
  DB: D1Database;
  SITES: Record<string, string[]>;
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

export const RETENTION_DAYS = 90;
export const DAY = 86_400_000;
