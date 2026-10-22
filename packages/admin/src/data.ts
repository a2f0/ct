export interface Summary {
  totals: { clicks: number; sites: number; pages: number };
  daily: { day: string; clicks: number }[];
  pages: { site: string; page: string; clicks: number }[];
  targets: { target: string; label: string | null; clicks: number }[];
}

export interface ClickRow {
  site: string;
  id: string;
  timestamp: number;
  page: string;
  target: string;
  label: string | null;
}
export interface Events {
  events: ClickRow[];
  nextCursor: string | null;
}

export async function getData<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal: signal ?? null,
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Too many refreshes. Try again in a minute."
        : "Could not load click data. Please try again.",
    );
  return response.json() as Promise<T>;
}

export const count = new Intl.NumberFormat("en").format;
export const time = (timestamp: number) =>
  new Date(timestamp).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  });
