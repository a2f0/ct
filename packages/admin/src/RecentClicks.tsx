import { useCallback, useEffect, useRef, useState } from "react";
import { count, type Events, getData, time } from "./data";

export function RecentClicks({
  initial,
  query,
}: {
  initial: Events;
  query: string;
}) {
  const [data, setData] = useState(initial);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState("");
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const consumed = useRef(new Set<string>());
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  const loadMore = useCallback(async () => {
    const cursor = data.nextCursor;
    // Observer callbacks can repeat before React commits a loading state.
    if (!cursor || busy.current) return;
    busy.current = true;
    const controller = new AbortController();
    active.current = controller;
    setPaging(true);
    setError("");
    try {
      const next = await getData<Events>(
        `/api/events?${query}&cursor=${encodeURIComponent(cursor)}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (
        next.nextCursor &&
        (next.nextCursor === cursor || consumed.current.has(next.nextCursor))
      ) {
        setRequiresRefresh(true);
        throw new Error(
          "Could not load older clicks. Use Refresh data to restart this list.",
        );
      }
      consumed.current.add(cursor);
      setData((current) => {
        const seen = new Set(
          current.events.map((event) => `${event.site}:${event.id}`),
        );
        const added = next.events.filter((event) => {
          const key = `${event.site}:${event.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return {
          events: [...current.events, ...added],
          nextCursor: next.nextCursor,
        };
      });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load more clicks.",
        );
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setPaging(false);
      }
    }
  }, [data.nextCursor, query]);

  useEffect(() => {
    if (
      !data.nextCursor ||
      paging ||
      error ||
      !sentinel.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [data.nextCursor, paging, error, loadMore]);

  return (
    <section className="card recent">
      <div className="card-heading">
        <div>
          <h2>Latest activity</h2>
          <p>Newest first. Times shown in UTC.</p>
        </div>
        <span className="pill">UTC</span>
      </div>
      <div className="table-scroll">
        <table aria-label="Recent clicks" aria-busy={paging}>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Site</th>
              <th scope="col">Page</th>
              <th scope="col">Target</th>
              <th scope="col">Label</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={`${event.site}:${event.id}`}>
                <td>
                  <time dateTime={new Date(event.timestamp).toISOString()}>
                    {time(event.timestamp)}
                  </time>
                </td>
                <td>{event.site}</td>
                <td className="path">{event.page}</td>
                <td>
                  <span className="tag">{event.target}</span>
                </td>
                <td>{event.label ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination" ref={sentinel}>
        <p role="status">
          {paging
            ? "Loading older clicks…"
            : data.events.length
              ? `${count(data.events.length)} clicks loaded${data.nextCursor ? "" : " · All clicks in this range are loaded."}`
              : "No clicks to show."}
        </p>
        {error && (
          <p className="pagination-error" role="alert">
            {error}
          </p>
        )}
        {data.nextCursor && !requiresRefresh && (
          <button
            className="load-more"
            disabled={paging}
            type="button"
            onClick={() => void loadMore()}
          >
            {paging ? "Loading…" : error ? "Retry loading more" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}
