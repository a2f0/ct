export interface Click {
  id: string;
  timestamp: number;
  page: string;
  target: string;
  label: string | null;
  app?: string | null;
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validClick(value: unknown): value is Click {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return (
    [
      "id,label,page,target,timestamp",
      "app,id,label,page,target,timestamp",
    ].includes(Object.keys(event).sort().join(",")) &&
    (event.app === undefined ||
      event.app === null ||
      (typeof event.app === "string" &&
        /^[a-z0-9][a-z0-9-]{0,63}$/.test(event.app))) &&
    typeof event.id === "string" &&
    uuid.test(event.id) &&
    typeof event.timestamp === "number" &&
    Number.isSafeInteger(event.timestamp) &&
    event.timestamp > 0 &&
    typeof event.page === "string" &&
    /^\/[a-zA-Z0-9/:_.-]{0,199}$/.test(event.page) &&
    typeof event.target === "string" &&
    /^[a-z][a-z0-9-]{0,31}$/.test(event.target) &&
    (event.label === null ||
      (typeof event.label === "string" &&
        /^[a-zA-Z0-9_.:-]{1,80}$/.test(event.label)))
  );
}

/** Correct clock skew with one offset so clicks retain their relative timing. */
export function normalizeTimes(events: Click[], now: number): Click[] | null {
  const newest = Math.max(...events.map((event) => event.timestamp));
  const oldest = Math.min(...events.map((event) => event.timestamp));
  if (oldest >= now - 86_400_000 && newest <= now + 300_000) return events;
  // Inconsistent clocks cannot be shifted into the accepted one-day window.
  if (newest - oldest > 86_400_000) return null;
  const offset = now - newest;
  return events.map((event) => ({
    ...event,
    timestamp: event.timestamp + offset,
  }));
}

export async function readBody(
  request: Request,
  maxBytes = 32_768,
): Promise<unknown> {
  if (Number(request.headers.get("Content-Length")) > maxBytes)
    throw new Error("too-large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("too-large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
