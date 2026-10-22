import { type AdminEnv, DAY, json, RETENTION_DAYS } from "./env";
import { parseFilters, recent, summary } from "./queries";

export async function admin(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method))
    return json({ error: "Read-only endpoint" }, 405, { Allow: "GET, HEAD" });
  if (!url.pathname.startsWith("/api/")) {
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    if (response.headers.get("Content-Type")?.includes("text/html"))
      response.headers.set(
        "Cache-Control",
        `${asset.headers.get("Cache-Control") ?? "public, max-age=0, must-revalidate"}, no-transform`,
      );
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
        access: "public-read-only",
      });
    }
    const filters = parseFilters(url, env.SITES);
    if (!filters)
      return json(
        {
          error:
            "Invalid site, app, environment or date range (maximum 90 days)",
        },
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
