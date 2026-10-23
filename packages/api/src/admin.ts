import { createAuth } from "./auth";
import { type AdminEnv, DAY, json, NOINDEX, RETENTION_DAYS } from "./env";
import { parseFilters, recent, summary } from "./queries";
import { readBody } from "./validation";

// Every dashboard response, including redirects, auth replies, errors and the
// sign-in page, keeps the private host out of search indexes.
export async function admin(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  const response = await route(request, env);
  response.headers.set("X-Robots-Tag", NOINDEX);
  return response;
}

async function route(request: Request, env: AdminEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/auth/")) {
    const method = new Map([
      ["/api/auth/sign-in/email", "POST"],
      ["/api/auth/get-session", "GET"],
      ["/api/auth/sign-out", "POST"],
      ["/api/auth/change-password", "POST"],
    ]).get(url.pathname);
    if (!method) return json({ error: "Not found" }, 404);
    if (request.method !== method)
      return json({ error: "Method not allowed" }, 405, { Allow: method });
    if (method === "POST") {
      let origin: string;
      try {
        origin = new URL(env.BETTER_AUTH_URL).origin;
      } catch {
        return json({ error: "Authentication temporarily unavailable" }, 503);
      }
      if (request.headers.get("Origin") !== origin)
        return json({ error: "Origin not allowed" }, 403);
      if (
        request.headers.get("Content-Type")?.split(";")[0]?.trim() !==
        "application/json"
      )
        return json({ error: "JSON required" }, 415);
      try {
        const body = await readBody(request, 8192);
        if (!body || typeof body !== "object" || Array.isArray(body))
          return json({ error: "Invalid request" }, 400);
        request = new Request(request, {
          body: JSON.stringify({
            ...body,
            ...(url.pathname.endsWith("/change-password")
              ? { revokeOtherSessions: true }
              : {}),
          }),
        });
      } catch {
        return json({ error: "Invalid request" }, 400);
      }
    }
    try {
      const response = await createAuth(env).handler(request);
      const secured = new Response(response.body, response);
      secured.headers.set("Cache-Control", "private, no-store");
      secured.headers.set("Vary", "Cookie");
      secured.headers.set("Referrer-Policy", "no-referrer");
      return secured;
    } catch {
      return json({ error: "Authentication temporarily unavailable" }, 503);
    }
  }
  const publicAsset =
    url.pathname === "/login" ||
    url.pathname === "/robots.txt" ||
    url.pathname === "/theme.js" ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/downloads/");
  if (!publicAsset || url.pathname.startsWith("/api/")) {
    try {
      const session = await createAuth(env).api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
      if (!session) {
        if (url.pathname.startsWith("/api/"))
          return json({ error: "Authentication required" }, 401);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`,
            "Cache-Control": "no-store",
          },
        });
      }
    } catch {
      return json({ error: "Authentication temporarily unavailable" }, 503);
    }
  }
  if (!["GET", "HEAD"].includes(request.method))
    return json({ error: "Read-only endpoint" }, 405, { Allow: "GET, HEAD" });
  if (!url.pathname.startsWith("/api/")) {
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    if (response.headers.get("Content-Type")?.includes("text/html"))
      response.headers.set("Cache-Control", "private, no-store, no-transform");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
  if (
    !(
      await env.READ_LIMITER.limit({
        key: request.headers.get("CF-Connecting-IP") ?? "local",
      })
    ).success
  )
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  try {
    if (url.pathname === "/api/sites") {
      const apps = await env.DB.prepare(
        "SELECT DISTINCT app FROM clicks WHERE app IS NOT NULL AND timestamp >= ? ORDER BY app LIMIT 500",
      )
        .bind(Date.now() - RETENTION_DAYS * DAY)
        .all<{ app: string }>()
        .catch(() => ({ results: [] as { app: string }[] }));
      return json({
        sites: Object.keys(env.SITES).sort(),
        apps: apps.results.map((row) => row.app),
        environments: ["production", "staging"],
        retentionDays: RETENTION_DAYS,
        access: "authenticated-read-only",
      });
    }
    const filters = parseFilters(url, env.SITES);
    if (!filters)
      return json(
        { error: "Invalid filter or date range (maximum 90 days)" },
        400,
      );
    if (url.pathname === "/api/summary")
      return json(await summary(env.DB, filters));
    if (url.pathname === "/api/events")
      return json(
        await recent(env.DB, filters, url.searchParams.get("cursor")),
      );
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error && error.message === "Invalid cursor"
            ? "Invalid cursor"
            : "Data temporarily unavailable",
      },
      error instanceof Error && error.message === "Invalid cursor" ? 400 : 503,
    );
  }
}

export default { fetch: admin } satisfies ExportedHandler<AdminEnv>;
