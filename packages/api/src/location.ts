export interface Location {
  continent: string | null;
  country: string | null;
  region: string | null;
  regionCode: string | null;
  city: string | null;
  timezone: string | null;
}

/** Removes shared locations once no retained click refers to them. */
export const DELETE_UNUSED_LOCATIONS =
  "DELETE FROM locations WHERE NOT EXISTS (SELECT 1 FROM clicks WHERE clicks.location_id = locations.id)";

export function text(value: unknown, limit = 128): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().normalize("NFC");
  return result && result.length <= limit && !/[\p{Cc}\p{Cf}]/u.test(result)
    ? result
    : null;
}

export function normalizeIp(value: string | null): string | null {
  if (!value || value.length > 45) return null;
  if (value.includes(":")) {
    if (!/^[0-9a-f:.]+$/i.test(value)) return null;
    try {
      // The URL parser validates and canonicalizes IPv6 without a Node polyfill.
      return new URL(`http://[${value}]/`).hostname.slice(1, -1);
    } catch {
      return null;
    }
  }
  const parts = value.split(".");
  return parts.length === 4 &&
    parts.every(
      (part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
    )
    ? value
    : null;
}

export function requestLocation(request: Request) {
  let ip = normalizeIp(request.headers.get("CF-Connecting-IP"));
  // Pseudo IPv4's overwrite mode retains the real address in this header.
  if (ip && !ip.includes(":") && Number(ip.split(".")[0]) >= 240) {
    const ipv6 = normalizeIp(request.headers.get("CF-Connecting-IPv6"));
    ip = ipv6?.includes(":") ? ipv6 : null;
  }
  const cf = request.cf;
  const country = text(cf?.country, 2)?.toUpperCase();
  const continent = text(cf?.continent, 2)?.toUpperCase();
  const regionCode = text(cf?.regionCode, 8);
  const location: Location = {
    continent:
      continent && /^(AF|AN|AS|EU|NA|OC|SA)$/.test(continent)
        ? continent
        : null,
    country:
      country && /^[A-Z]{2}$/.test(country) && country !== "XX"
        ? country
        : null,
    region: text(cf?.region),
    regionCode:
      regionCode && /^[A-Za-z0-9-]+$/.test(regionCode)
        ? regionCode.toUpperCase()
        : null,
    city: text(cf?.city),
    timezone: text(cf?.timezone, 64),
  };
  const values = [
    location.continent,
    location.country,
    location.region,
    location.regionCode,
    location.city,
    location.timezone,
  ];
  return {
    ip,
    values,
    key: values.some((value) => value !== null) ? JSON.stringify(values) : null,
  };
}
