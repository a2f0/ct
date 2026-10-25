import { createAuth } from "./auth";
import { type AdminEnv, DAY, json, NOINDEX, RETENTION_DAYS } from "./env";
import { normalizeIp } from "./location";
import { forgetIp, parseFilters, recent, summary } from "./queries";
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

// WebView origins of the native app shell (packages/app-capacitor) on iOS and Android.
const NATIVE_ORIGINS = ["capacitor://localhost", "https://localhost"];

/**
 * The app shell sends requests through the platform's HTTP stack, which keeps
 * its session cookie but omits the Origin a WebView fetch would carry. Its
 * marker header stands in for the dashboard origin only when no Origin is
 * present. It is not authentication: cookies still authorize every request,
 * and browsers always send Origin on cross-origin requests, which this Worker
 * never allows through CORS. Non-browser clients could already send the
 * dashboard Origin directly.
 */
function withNativeOrigin(request: Request, env: AdminEnv): Request {
  if (
    request.headers.has("Origin") ||
    !NATIVE_ORIGINS.includes(request.headers.get("X-CT-Native-Origin") ?? "")
  )
    return request;
  let origin: string;
  try {
    origin = new URL(env.BETTER_AUTH_URL).origin;
  } catch {
    return request; // Mutations fail closed on the invalid configuration.
  }
  const headers = new Headers(request.headers);
  headers.set("Origin", origin);
  return new Request(request, { headers });
}

async function route(request: Request, env: AdminEnv): Promise<Response> {
  request = withNativeOrigin(request, env);
  const url = new URL(request.url);
  // Public association metadata lets iOS share passwords with the CT app.
  // This exact route needs neither a session nor a functioning auth database.
  if (url.pathname === "/.well-known/apple-app-site-association") {
    if (!["GET", "HEAD"].includes(request.method))
      return json({ error: "Method not allowed" }, 405, { Allow: "GET, HEAD" });
    return new Response(
      request.method === "HEAD"
        ? null
        : JSON.stringify({
            // The prefix must match the iOS release signing Team ID.
            webcredentials: { apps: ["H4QLD7XWGS.net.a2f0.ct"] },
          }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
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
      const body = await jsonBody(request, env, 8192);
      if (body instanceof Response) return body;
      request = new Request(request, {
        body: JSON.stringify({
          ...body,
          ...(url.pathname.endsWith("/change-password")
            ? { revokeOtherSessions: true }
            : {}),
        }),
      });
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
  // The policy pages hold no data; the store listings link to them.
  const publicAsset =
    url.pathname === "/login" ||
    url.pathname === "/privacy" ||
    url.pathname === "/support" ||
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
  // Forgetting an IP is the only data mutation; everything else is read-only.
  if (url.pathname === "/api/forget") {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  } else if (!["GET", "HEAD"].includes(request.method))
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
        access: "authenticated",
      });
    }
    if (url.pathname === "/api/forget") {
      const body = await jsonBody(request, env, 1024);
      if (body instanceof Response) return body;
      const ip =
        Object.keys(body).join() === "ip" && typeof body.ip === "string"
          ? normalizeIp(body.ip)
          : null;
      if (!ip) return json({ error: "Invalid IP address" }, 400);
      return json(await forgetIp(env.DB, ip));
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

/** Mutations accept only bounded JSON objects posted from the dashboard origin. */
async function jsonBody(
  request: Request,
  env: AdminEnv,
  maxBytes: number,
): Promise<Record<string, unknown> | Response> {
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
    const body = await readBody(request, maxBytes);
    if (body && typeof body === "object" && !Array.isArray(body))
      return body as Record<string, unknown>;
  } catch {}
  return json({ error: "Invalid request" }, 400);
}

export default { fetch: admin } satisfies ExportedHandler<AdminEnv>;
