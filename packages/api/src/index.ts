import { DAY, type Env, json, NOINDEX, RETENTION_DAYS } from "./env";
import { DELETE_UNUSED_LOCATIONS, requestLocation } from "./location";
import { normalizeTimes, readBody, validClick } from "./validation";

export async function ingest(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET")
    return json({ ok: true, protocolVersion: 2 }, 200, {
      "X-Robots-Tag": NOINDEX,
    });
  if (path !== "/v1/clicks")
    return json({ error: "Not found" }, 404, { "X-Robots-Tag": NOINDEX });
  const origin = request.headers.get("Origin");
  if (
    !origin ||
    !Object.values(env.SITES).some((origins) => Object.hasOwn(origins, origin))
  )
    return json({ error: "Origin not allowed" }, 403);
  const cors = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (request.method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: { ...cors, "Access-Control-Max-Age": "3600" },
    });
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405, {
      ...cors,
      Allow: "POST, OPTIONS",
    });
  if (
    !["application/json", "text/plain"].includes(
      request.headers
        .get("Content-Type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() ?? "",
    )
  )
    return json({ error: "Unsupported content type" }, 415, cors);
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (!(await env.INGEST_LIMITER.limit({ key: ip })).success)
    return json({ error: "Too many requests" }, 429, {
      ...cors,
      "Retry-After": "60",
    });
  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return json(
      { error: "Invalid batch" },
      error instanceof Error && error.message === "too-large" ? 413 : 400,
      cors,
    );
  }
  if (!body || typeof body !== "object")
    return json({ error: "Invalid batch" }, 400, cors);
  const { site, events, environment } = body as Record<string, unknown>;
  if (
    typeof site !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(site) ||
    !Object.hasOwn(env.SITES, site) ||
    !Object.hasOwn(env.SITES[site] ?? {}, origin)
  )
    return json({ error: "Site not allowed" }, 403, cors);
  const resolvedEnvironment = env.SITES[site]?.[origin];
  if (environment !== undefined && environment !== resolvedEnvironment)
    return json({ error: "Environment does not match site origin" }, 400, cors);
  const now = Date.now();
  if (
    !Array.isArray(events) ||
    events.length < 1 ||
    events.length > 50 ||
    !events.every((event) => validClick(event))
  )
    return json({ error: "Invalid events" }, 400, cors);
  const normalized = normalizeTimes(events, now);
  if (!normalized)
    return json({ error: "Inconsistent event timestamps" }, 400, cors);
  const location = requestLocation(request);
  try {
    const statements: D1PreparedStatement[] = [];
    if (location.key)
      statements.push(
        env.DB.prepare(
          "INSERT INTO locations (location_key, continent, country, region, region_code, city, timezone) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(location_key) DO NOTHING",
        ).bind(location.key, ...location.values),
      );
    // Nine rows use 99 bindings (D1 permits 100 per statement), and a full
    // 50-event delivery uses at most seven statements including the location.
    for (let offset = 0; offset < normalized.length; offset += 9) {
      const chunk = normalized.slice(offset, offset + 9);
      const placeholders = chunk
        .map(
          () =>
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM locations WHERE location_key = ?))",
        )
        .join(", ");
      statements.push(
        env.DB.prepare(
          `INSERT INTO clicks (site, id, timestamp, received_at, page, target, label, app, environment, ip_address, location_id) VALUES ${placeholders} ON CONFLICT(site, id) DO NOTHING`,
        ).bind(
          ...chunk.flatMap((event) => [
            site,
            event.id.toLowerCase(),
            event.timestamp,
            now,
            event.page,
            event.target,
            event.label,
            event.app ?? null,
            resolvedEnvironment ?? null,
            location.ip,
            location.key,
          ]),
        ),
      );
    }
    await env.DB.batch(statements);
  } catch {
    return json({ error: "Storage temporarily unavailable" }, 503, cors);
  }
  return json({ accepted: events.length }, 202, cors);
}

export default {
  fetch: ingest,
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM clicks WHERE timestamp < ?").bind(
        now - RETENTION_DAYS * DAY,
      ),
      env.DB.prepare(DELETE_UNUSED_LOCATIONS),
      env.DB.prepare("DELETE FROM auth_rate_limit WHERE lastRequest < ?").bind(
        now - DAY,
      ),
      env.DB.prepare("DELETE FROM auth_session WHERE expiresAt <= ?").bind(
        new Date(now).toISOString(),
      ),
      env.DB.prepare("DELETE FROM auth_verification WHERE expiresAt <= ?").bind(
        new Date(now).toISOString(),
      ),
    ]);
  },
} satisfies ExportedHandler<Env>;
