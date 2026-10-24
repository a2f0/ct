import { DAY, RETENTION_DAYS, type Sites } from "./env";
import {
  DELETE_UNUSED_LOCATIONS,
  type Location,
  normalizeIp,
  text,
} from "./location";
import { APP, LABEL, PAGE, TARGET } from "./validation";

const UNKNOWN = "~unknown";
const match = (pattern: RegExp) => (value: string) =>
  pattern.test(value) ? value : null;

/** Exact-match click dimensions; ~unknown selects clicks missing the value. */
const DIMENSIONS = {
  app: { column: "clicks.app", parse: match(APP) },
  environment: {
    column: "clicks.environment",
    parse: match(/^(production|staging)$/),
  },
  ip: { column: "clicks.ip_address", parse: normalizeIp },
  country: { column: "locations.country", parse: match(/^[A-Z]{2}$/) },
  region: { column: "locations.region", parse: text },
  regionCode: {
    column: "locations.region_code",
    parse: match(/^[A-Z0-9-]{1,8}$/),
  },
  city: { column: "locations.city", parse: text },
  page: { column: "clicks.page", parse: match(PAGE) },
  target: { column: "clicks.target", parse: match(TARGET) },
  label: { column: "clicks.label", parse: match(LABEL) },
} satisfies Record<
  string,
  { column: string; parse: (value: string) => string | null }
>;
type Dimension = keyof typeof DIMENSIONS;

/** Clicks without a location row join as all-null, matching the Unknown groups. */
const SOURCE =
  "clicks LEFT JOIN locations ON clicks.location_id = locations.id";

export interface Filters extends Partial<Record<Dimension, string | null>> {
  site: string | null;
  from: number;
  to: number;
}

export function parseFilters(
  url: URL,
  sites: Sites,
  now = Date.now(),
): Filters | null {
  const site = url.searchParams.get("site") || null;
  const fromText = url.searchParams.get("from");
  const toText = url.searchParams.get("to");
  const from = fromText ? Date.parse(fromText) : now - 7 * DAY;
  const to = toText ? Date.parse(toText) : now + 300_000;
  if (
    (site !== null && !Object.hasOwn(sites, site)) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > (RETENTION_DAYS + 1) * DAY
  )
    return null;
  const filters: Filters = { site, from, to };
  for (const name of Object.keys(DIMENSIONS) as Dimension[]) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    const parsed = value === UNKNOWN ? value : DIMENSIONS[name].parse(value);
    if (parsed === null) return null;
    filters[name] = parsed;
  }
  return filters;
}

function where(filters: Filters): { sql: string; values: (string | number)[] } {
  const clauses = ["clicks.timestamp >= ?", "clicks.timestamp < ?"];
  const values: (string | number)[] = [filters.from, filters.to];
  if (filters.site) {
    clauses.push("clicks.site = ?");
    values.push(filters.site);
  }
  for (const name of Object.keys(DIMENSIONS) as Dimension[]) {
    const value = filters[name];
    if (!value) continue;
    const { column } = DIMENSIONS[name];
    if (value === UNKNOWN) clauses.push(`${column} IS NULL`);
    else {
      clauses.push(`${column} = ?`);
      values.push(value);
    }
  }
  return { sql: clauses.join(" AND "), values };
}

export async function summary(db: D1Database, filters: Filters) {
  const { sql, values } = where(filters);
  const statements = [
    `SELECT COUNT(*) AS clicks, COUNT(DISTINCT site) AS sites, COUNT(DISTINCT site || ':' || page) AS pages FROM ${SOURCE} WHERE ${sql}`,
    `SELECT strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch') AS day, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY day ORDER BY day`,
    `SELECT site, page, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY site, page ORDER BY clicks DESC, site, page LIMIT 20`,
    `SELECT target, label, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY target, label ORDER BY clicks DESC, target, label LIMIT 20`,
    `SELECT app, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY app ORDER BY clicks DESC, app LIMIT 20`,
    `SELECT environment, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY environment ORDER BY clicks DESC, environment`,
    `SELECT country, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY country ORDER BY clicks DESC, country LIMIT 20`,
    `SELECT country, region, region_code AS regionCode, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY country, region, region_code ORDER BY clicks DESC, country, region, region_code LIMIT 20`,
    `SELECT country, region, region_code AS regionCode, city, COUNT(*) AS clicks FROM ${SOURCE} WHERE ${sql} GROUP BY country, region, region_code, city ORDER BY clicks DESC, country, region, region_code, city LIMIT 20`,
  ];
  const [
    totals,
    daily,
    pages,
    targets,
    apps,
    environments,
    countries,
    regions,
    cities,
  ] = await db.batch(
    statements.map((statement) => db.prepare(statement).bind(...values)),
  );
  return {
    totals: totals?.results[0] ?? { clicks: 0, sites: 0, pages: 0 },
    daily: daily?.results ?? [],
    pages: pages?.results ?? [],
    targets: targets?.results ?? [],
    apps: apps?.results ?? [],
    environments: environments?.results ?? [],
    geography: {
      countries: countries?.results ?? [],
      regions: regions?.results ?? [],
      cities: cities?.results ?? [],
    },
  };
}

export async function recent(
  db: D1Database,
  filters: Filters,
  cursor: string | null,
) {
  const { sql, values } = where(filters);
  let after = "";
  if (cursor) {
    const match = /^(\d{13})_([0-9a-f-]{36})_([a-z0-9-]{1,64})$/.exec(cursor);
    if (!match) throw new Error("Invalid cursor");
    after = " AND (clicks.timestamp, clicks.id, clicks.site) < (?, ?, ?)";
    values.push(Number(match[1]), match[2] ?? "", match[3] ?? "");
  }
  const result = await db
    .prepare(
      `SELECT clicks.site AS site, clicks.id AS id, timestamp, page, target, label, app, environment, ip_address AS ip, locations.id AS locationId, continent, country, region, region_code AS regionCode, city, timezone FROM ${SOURCE} WHERE ${sql}${after} ORDER BY timestamp DESC, clicks.id DESC, site DESC LIMIT 101`,
    )
    .bind(...values)
    .all<
      Location & {
        site: string;
        id: string;
        timestamp: number;
        page: string;
        target: string;
        label: string | null;
        app: string | null;
        environment: string | null;
        ip: string | null;
        locationId: number | null;
      }
    >();
  const events = result.results
    .slice(0, 100)
    .map(
      ({
        locationId,
        continent,
        country,
        region,
        regionCode,
        city,
        timezone,
        ...event
      }) => ({
        ...event,
        location:
          locationId === null
            ? null
            : { continent, country, region, regionCode, city, timezone },
      }),
    );
  const last = events.at(-1);
  return {
    events,
    nextCursor:
      result.results.length > 100 && last
        ? `${last.timestamp}_${last.id}_${last.site}`
        : null,
  };
}

/**
 * Deletes every retained click recorded from one address, whatever its site,
 * dimensions or date, and any location that only those clicks referenced.
 */
export async function forgetIp(db: D1Database, ip: string) {
  const [clicks] = await db.batch([
    db.prepare("DELETE FROM clicks WHERE ip_address = ?").bind(ip),
    db.prepare(DELETE_UNUSED_LOCATIONS),
  ]);
  return { ip, deleted: clicks?.meta.changes ?? 0 };
}
