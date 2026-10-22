/** Both Workers must agree about public sites and each exact origin's environment. */
export function canonicalSites(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("SITES must be an object");
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (!entries.length) throw new Error("SITES must register at least one site");
  const seen = new Map<string, string>();
  return JSON.stringify(
    entries.map(([site, origins]) => {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(site))
        throw new Error(`Invalid site identifier: ${site}`);
      if (
        !origins ||
        typeof origins !== "object" ||
        Array.isArray(origins) ||
        !Object.keys(origins).length
      )
        throw new Error(
          `Expected exact HTTPS origins mapped to environments for ${site}`,
        );
      const hosts = Object.entries(origins).sort(([left], [right]) =>
        left.localeCompare(right),
      );
      for (const [origin, environment] of hosts) {
        const url = new URL(origin);
        if (url.protocol !== "https:" || url.origin !== origin)
          throw new Error(`Invalid origin for ${site}`);
        if (environment !== "production" && environment !== "staging")
          throw new Error(`Invalid environment for ${site}`);
        if (seen.has(origin) && seen.get(origin) !== environment)
          throw new Error(`Conflicting environments for ${origin}`);
        seen.set(origin, environment);
      }
      return [site, hosts];
    }),
  );
}
