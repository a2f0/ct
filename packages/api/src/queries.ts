import { DAY, RETENTION_DAYS } from "./env";
import type { Location } from "./location";

export interface Filters {
  site: string | null;
  from: number;
  to: number;
}

export function parseFilters(
  url: URL,
  sites: Record<string, string[]>,
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
  return { site, from, to };
}

function where(filters: Filters): { sql: string; values: (string | number)[] } {
  return filters.site
    ? {
        sql: "clicks.timestamp >= ? AND clicks.timestamp < ? AND clicks.site = ?",
        values: [filters.from, filters.to, filters.site],
      }
    : {
        sql: "clicks.timestamp >= ? AND clicks.timestamp < ?",
        values: [filters.from, filters.to],
      };
}

export async function summary(db: D1Database, filters: Filters) {
  const { sql, values } = where(filters);
  const statements = [
    `SELECT COUNT(*) AS clicks, COUNT(DISTINCT site) AS sites, COUNT(DISTINCT site || ':' || page) AS pages FROM clicks WHERE ${sql}`,
    `SELECT strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch') AS day, COUNT(*) AS clicks FROM clicks WHERE ${sql} GROUP BY day ORDER BY day`,
    `SELECT site, page, COUNT(*) AS clicks FROM clicks WHERE ${sql} GROUP BY site, page ORDER BY clicks DESC, site, page LIMIT 20`,
    `SELECT target, label, COUNT(*) AS clicks FROM clicks WHERE ${sql} GROUP BY target, label ORDER BY clicks DESC, target, label LIMIT 20`,
    `SELECT country, COUNT(*) AS clicks FROM clicks LEFT JOIN locations ON clicks.location_id = locations.id WHERE ${sql} GROUP BY country ORDER BY clicks DESC, country LIMIT 20`,
    `SELECT country, region, region_code AS regionCode, COUNT(*) AS clicks FROM clicks LEFT JOIN locations ON clicks.location_id = locations.id WHERE ${sql} GROUP BY country, region, region_code ORDER BY clicks DESC, country, region, region_code LIMIT 20`,
    `SELECT country, region, region_code AS regionCode, city, COUNT(*) AS clicks FROM clicks LEFT JOIN locations ON clicks.location_id = locations.id WHERE ${sql} GROUP BY country, region, region_code, city ORDER BY clicks DESC, country, region, region_code, city LIMIT 20`,
  ];
  const [totals, daily, pages, targets, countries, regions, cities] =
    await db.batch(
      statements.map((statement) => db.prepare(statement).bind(...values)),
    );
  return {
    totals: totals?.results[0] ?? { clicks: 0, sites: 0, pages: 0 },
    daily: daily?.results ?? [],
    pages: pages?.results ?? [],
    targets: targets?.results ?? [],
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
      `SELECT clicks.site, clicks.id, timestamp, page, target, label, ip_address AS ip, locations.id AS locationId, continent, country, region, region_code AS regionCode, city, timezone FROM clicks LEFT JOIN locations ON clicks.location_id = locations.id WHERE ${sql}${after} ORDER BY timestamp DESC, clicks.id DESC, site DESC LIMIT 101`,
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
