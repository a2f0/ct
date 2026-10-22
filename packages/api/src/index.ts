import { DAY, type Env, json, RETENTION_DAYS } from "./env";
import { readBody, validClick } from "./validation";

export async function ingest(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") return json({ ok: true });
  if (path !== "/v1/clicks") return json({ error: "Not found" }, 404);
  const origin = request.headers.get("Origin");
  if (
    !origin ||
    !Object.values(env.SITES).some((origins) => origins.includes(origin))
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
      request.headers.get("Content-Type")?.split(";")[0]?.trim() ?? "",
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
  const { site, events } = body as Record<string, unknown>;
  if (
    typeof site !== "string" ||
    !Object.hasOwn(env.SITES, site) ||
    !env.SITES[site]?.includes(origin)
  )
    return json({ error: "Site not allowed" }, 403, cors);
  const now = Date.now();
  if (
    !Array.isArray(events) ||
    events.length < 1 ||
    events.length > 50 ||
    !events.every((event) => validClick(event, now))
  )
    return json({ error: "Invalid events" }, 400, cors);
  const statement = env.DB.prepare(
    "INSERT INTO clicks (site, id, timestamp, received_at, page, target, label) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(site, id) DO NOTHING",
  );
  try {
    await env.DB.batch(
      events.map((event) =>
        statement.bind(
          site,
          event.id.toLowerCase(),
          event.timestamp,
          now,
          event.page,
          event.target,
          event.label,
        ),
      ),
    );
  } catch {
    return json({ error: "Storage temporarily unavailable" }, 503, cors);
  }
  return json({ accepted: events.length }, 202, cors);
}

export default {
  fetch: ingest,
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await env.DB.prepare("DELETE FROM clicks WHERE timestamp < ?")
      .bind(Date.now() - RETENTION_DAYS * DAY)
      .run();
  },
} satisfies ExportedHandler<Env>;
