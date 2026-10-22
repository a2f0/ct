import {
  clickTarget,
  OPT_OUT_EVENT,
  OPT_OUT_KEY,
  optedOut,
  safePage,
} from "./privacy.js";
import type { ClickEvent, Tracker, TrackerOptions } from "./types.js";

export type { ClickEvent, Tracker, TrackerOptions } from "./types.js";

/** No browser globals, timers, listeners, or requests are touched until init(). */
export function createTracker(options: TrackerOptions): Tracker {
  const batchSize = bounded(options.batchSize, 20, 1, 50);
  const interval = bounded(options.flushIntervalMs, 5_000, 100, 60_000);
  const capacity = bounded(options.maxQueueSize, 500, batchSize, 1_000);
  const endpoint = options.endpoint ?? "https://ct.a2f0.net/v1/clicks";
  let initialized = false;
  let disabled = false;
  let queue: ClickEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let inFlight: Promise<void> | undefined;
  let failures = 0;
  let generation = 0;

  function clear(): void {
    generation++;
    failures = 0;
    queue = [];
    if (timer) clearTimeout(timer);
    timer = undefined;
    request?.abort();
  }

  function blocked(): boolean {
    if (disabled || optedOut()) {
      clear();
      return true;
    }
    return false;
  }

  function schedule(): void {
    if (!initialized || !queue.length || timer) return;
    const delay = failures
      ? Math.min(60_000, interval * 2 ** Math.min(failures, 5))
      : interval;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  }

  async function send(): Promise<void> {
    const currentGeneration = generation;
    const batch = queue.slice(0, batchSize);
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ site: options.site, events: batch }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        keepalive: true,
        signal: controller.signal,
      });
      if (currentGeneration !== generation) return;
      if (
        response.ok ||
        (response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408 &&
          response.status !== 429)
      ) {
        const ids = new Set(batch.map((event) => event.id));
        queue = queue.filter((event) => !ids.has(event.id));
        failures = 0;
      } else failures++;
    } catch {
      if (currentGeneration === generation) failures++;
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = undefined;
    }
  }

  function flush(): Promise<void> {
    if (!initialized || blocked()) return Promise.resolve();
    if (inFlight) return inFlight;
    if (!queue.length) return Promise.resolve();
    if (timer) clearTimeout(timer);
    timer = undefined;
    inFlight = send().finally(() => {
      inFlight = undefined;
      schedule();
    });
    return inFlight;
  }

  function click(event: MouseEvent): void {
    if (!event.isTrusted || blocked()) return;
    const target = clickTarget(event, options.capture ?? "interactive");
    if (!target || queue.length >= capacity) return;
    try {
      queue.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        page: safePage(options.page?.() ?? "/"),
        ...target,
      });
    } catch {
      return;
    }
    if (queue.length >= batchSize && !failures) void flush();
    else schedule();
  }

  function privacyChanged(): void {
    blocked();
  }
  function visibilityChanged(): void {
    if (document.visibilityState === "hidden") void flush();
  }
  function pageHidden(): void {
    void flush();
  }
  function online(): void {
    failures = 0;
    void flush();
  }

  return {
    init() {
      if (initialized) return !blocked();
      if (
        options.enabled === false ||
        typeof window === "undefined" ||
        typeof document === "undefined"
      )
        return false;
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.site))
        throw new Error("Invalid ct site identifier");
      const url = new URL(endpoint);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        throw new Error("ct requires an HTTPS endpoint");
      if (navigator.webdriver === true) return false;
      initialized = true;
      document.addEventListener("click", click, true);
      document.addEventListener("visibilitychange", visibilityChanged);
      window.addEventListener("pagehide", pageHidden);
      window.addEventListener("online", online);
      window.addEventListener("storage", privacyChanged);
      document.addEventListener(OPT_OUT_EVENT, privacyChanged);
      return !blocked();
    },
    flush,
    destroy() {
      if (initialized) {
        document.removeEventListener("click", click, true);
        document.removeEventListener("visibilitychange", visibilityChanged);
        window.removeEventListener("pagehide", pageHidden);
        window.removeEventListener("online", online);
        window.removeEventListener("storage", privacyChanged);
        document.removeEventListener(OPT_OUT_EVENT, privacyChanged);
      }
      initialized = false;
      clear();
    },
    setOptOut(value) {
      disabled = value;
      if (value) clear();
      if (typeof window === "undefined") return;
      try {
        if (value) localStorage.setItem(OPT_OUT_KEY, "1");
        else localStorage.removeItem(OPT_OUT_KEY);
      } catch {
        /* In-memory preference still applies. */
      }
      document.dispatchEvent(new Event(OPT_OUT_EVENT));
    },
  };
}

function bounded(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value)))
    : fallback;
}
