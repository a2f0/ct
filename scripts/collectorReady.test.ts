import { expect, test } from "bun:test";

import { collectorReady, waitForCollector } from "./collectorReady";

const origins = ["https://a.example", "https://staging.a.example"];
function fetcher(protocolVersion: unknown, allow = true) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/health"))
      return Response.json({ protocolVersion });
    expect(init?.method).toBe("OPTIONS");
    const origin = new Headers(init?.headers).get("Origin") ?? "";
    return new Response(null, {
      status: allow ? 204 : 403,
      headers: { "Access-Control-Allow-Origin": allow ? origin : "*" },
    });
  }) as typeof fetch;
}
test("publication requires a compatible collector and exact origin preflights", async () => {
  for (const version of [undefined, null, "2", 1, 2.5])
    expect(await collectorReady(origins, fetcher(version))).toBe(false);
  expect(await collectorReady(origins, fetcher(2))).toBe(true);
  expect(await collectorReady(origins, fetcher(3))).toBe(true);
  expect(await collectorReady(origins, fetcher(2, false))).toBe(false);
  expect(
    await collectorReady(origins, (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch),
  ).toBe(false);
});
test("publication retries bounded readiness failures and fails closed after the deadline", async () => {
  let calls = 0;
  let pauses = 0;
  await waitForCollector(origins, {
    attempts: 3,
    check: async () => ++calls === 3,
    pause: async () => {
      pauses++;
    },
  });
  expect(calls).toBe(3);
  expect(pauses).toBe(2);
  await expect(
    waitForCollector(origins, {
      attempts: 2,
      check: async () => false,
      pause: async () => {},
    }),
  ).rejects.toThrow("Deploy migration and both Workers");
});
