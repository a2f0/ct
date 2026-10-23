/** Release only after collector compatibility and private admin access are live. */
export const CLIENT_PROTOCOL = 2;
const collector = "https://ct.a2f0.net";

export async function collectorReady(
  origins: string[],
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(`${collector}/health`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const health = (await response.json()) as { protocolVersion?: unknown };
    if (
      typeof health.protocolVersion !== "number" ||
      !Number.isInteger(health.protocolVersion) ||
      health.protocolVersion < CLIENT_PROTOCOL
    )
      return false;
    const checks = await Promise.all(
      origins.map(async (origin) => {
        const preflight = await fetcher(`${collector}/v1/clicks`, {
          method: "OPTIONS",
          headers: { Origin: origin },
          signal: AbortSignal.timeout(5_000),
          cache: "no-store",
        });
        return (
          preflight.status === 204 &&
          preflight.headers.get("Access-Control-Allow-Origin") === origin
        );
      }),
    );
    const privateAdmin = await Promise.all(
      ["/api/sites", "/api/summary", "/api/events"].map(async (path) => {
        const response = await fetcher(`https://ct-admin.a2f0.net${path}`, {
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          signal: AbortSignal.timeout(5_000),
        });
        return response.status === 401;
      }),
    );
    return checks.every(Boolean) && privateAdmin.every(Boolean);
  } catch {
    return false;
  }
}

export async function waitForCollector(
  origins: string[],
  options: {
    attempts?: number;
    check?: () => Promise<boolean>;
    pause?: () => Promise<void>;
  } = {},
): Promise<void> {
  const attempts = options.attempts ?? 60;
  const check = options.check ?? (() => collectorReady(origins));
  const pause =
    options.pause ??
    (() => new Promise((resolve) => setTimeout(resolve, 5_000)));
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await check()) return;
    if (attempt < attempts - 1) await pause();
  }
  throw new Error(
    "Collector protocol/origins or authenticated admin access are not ready. Deploy migration and both Workers, then rerun Publish client.",
  );
}

if (import.meta.main) {
  const config = await Bun.file(
    new URL("../../packages/api/wrangler.json", import.meta.url),
  ).json();
  const origins = [
    ...new Set(
      Object.values(
        config.vars.SITES as Record<string, Record<string, string>>,
      ).flatMap(Object.keys),
    ),
  ];
  console.log(
    `Waiting for collector protocol ${CLIENT_PROTOCOL} and ${origins.length} registered origins, plus private admin APIs, before publishing.`,
  );
  await waitForCollector(origins);
  console.log(
    "Collector and authenticated admin readiness verified without writing click data.",
  );
}
