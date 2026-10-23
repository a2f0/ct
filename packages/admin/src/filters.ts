import { countryName } from "./data";

export const UNKNOWN = "~unknown";

/** Filters shared by every view and carried between them. */
export interface Filters {
  site: string;
  app: string;
  environment: string;
  days: number;
}

/**
 * Drill-down dimensions narrow the recent-click list. Their values stay in the
 * query string: Cloudflare's asset router decodes, merges slashes in, and
 * re-encodes paths, so values such as "Biel/Bienne" cannot be path segments.
 */
const SCOPE = [
  "ip",
  "country",
  "region",
  "city",
  "page",
  "target",
  "label",
] as const;
export type Scope = Partial<Record<(typeof SCOPE)[number], string | null>>;
/** A clicked value; null selects clicks missing it (shown as Unknown). */
export type Drill = Scope &
  Partial<Record<"site" | "app" | "environment", string | null>>;
export type Link = (drill: Drill) => string;

export function readFilters(search: string): Filters {
  const query = new URLSearchParams(search);
  const app = query.get("app") ?? "";
  const environment = query.get("environment") ?? "";
  const days = Number(query.get("days"));
  return {
    site: query.get("site") ?? "",
    app: app === UNKNOWN || /^[a-z0-9][a-z0-9-]{0,63}$/.test(app) ? app : "",
    environment:
      environment === "all"
        ? ""
        : ["production", "staging", UNKNOWN].includes(environment)
          ? environment
          : "production",
    days: [1, 7, 30, 90].includes(days) ? days : 7,
  };
}

export function readScope(search: string): Scope {
  const query = new URLSearchParams(search);
  const scope: Scope = {};
  for (const key of SCOPE) {
    const value = query.get(key);
    if (value) scope[key] = value === UNKNOWN ? null : value;
  }
  return scope;
}

export function encodeFilters(
  { site, app, environment, days }: Filters,
  scope: Scope = {},
) {
  const query = new URLSearchParams();
  for (const key of SCOPE) {
    const value = scope[key];
    if (value !== undefined) query.set(key, value ?? UNKNOWN);
  }
  if (site) query.set("site", site);
  if (app) query.set("app", app);
  if (environment !== "production")
    query.set("environment", environment || "all");
  if (days !== 7) query.set("days", String(days));
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

/** Links to the recent clicks matching a value under the current filters. */
export function drillHref(
  { site, app, environment, ...scope }: Drill,
  filters: Filters,
): string {
  const pick = (value: string | null | undefined, current: string) =>
    value === undefined ? current : (value ?? UNKNOWN);
  const shared = {
    site: pick(site, filters.site),
    app: pick(app, filters.app),
    environment: pick(environment, filters.environment),
    days: filters.days,
  };
  return `/recent${encodeFilters(shared, scope)}`;
}

export function scopeHeading(scope: Scope) {
  const show = (value: string | null | undefined, unknown: string) =>
    value === undefined ? [] : [value ?? unknown];
  const place = [
    ...show(scope.city, "Unknown city"),
    ...show(scope.region, "Unknown region"),
    ...(scope.country === undefined ? [] : [countryName(scope.country)]),
  ];
  const element = [
    ...show(scope.target, "Unknown target"),
    ...show(scope.label, "No label"),
  ];
  if (scope.ip !== undefined)
    return { eyebrow: "IP ADDRESS", title: scope.ip ?? "Unknown IP address" };
  if (place.length) return { eyebrow: "LOCATION", title: place.join(", ") };
  if (scope.page !== undefined)
    return { eyebrow: "PAGE", title: scope.page ?? "Unknown page" };
  if (element.length) return { eyebrow: "TARGET", title: element.join(" · ") };
  return null;
}
