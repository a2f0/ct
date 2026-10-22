export interface ClickEvent {
  id: string;
  timestamp: number;
  page: string;
  target: string;
  label: string | null;
}

export interface TrackerOptions {
  /** Public site identifier registered by the ingestion API. */
  site: string;
  endpoint?: string;
  /** Return a route template, never a URL containing user data. Defaults to "/". */
  page?: () => string;
  capture?: "all" | "interactive" | "marked";
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  enabled?: boolean;
  /** Ignore Global Privacy Control only when true. Defaults to false; other opt-outs still apply. */
  overrideGpc?: boolean;
}

export interface Tracker {
  /** Attach listeners idempotently. Returns whether capture is currently allowed. */
  init(): boolean;
  /** Flush queued clicks. Network failures are retained and retried automatically. */
  flush(): Promise<void>;
  /** Stop capture, abort pending requests, and discard queued clicks. */
  destroy(): void;
  /** Persist this site's preference and immediately discard queued clicks when disabled. */
  setOptOut(disabled: boolean): void;
}
