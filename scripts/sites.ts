/** Both Workers must agree about public site names and their exact origins. */
export function canonicalSites(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("SITES must be an object");
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (!entries.length) throw new Error("SITES must register at least one site");
  for (const [site, origins] of entries) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(site))
      throw new Error(`Invalid site identifier: ${site}`);
    if (
      !Array.isArray(origins) ||
      !origins.length ||
      !origins.every((origin) => {
        if (typeof origin !== "string") return false;
        try {
          const url = new URL(origin);
          return url.protocol === "https:" && url.origin === origin;
        } catch {
          return false;
        }
      })
    )
      throw new Error(`Expected exact HTTPS origins for ${site}`);
  }
  return JSON.stringify(
    entries.map(([site, origins]) => [site, [...new Set(origins)].sort()]),
  );
}
