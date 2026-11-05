import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import {
  count,
  countryName,
  type Events,
  forgetIp,
  getData,
  time,
} from "./data";
import type { Link } from "./filters";
import {
  idlePager,
  type PagerEvent,
  type PagerState,
  pagerTransition,
} from "./pager";

export function RecentClicks({
  initial,
  query,
  link,
  notify,
  onForgotten,
}: {
  initial: Events;
  query: string;
  link: Link;
  notify: (message: string) => void;
  onForgotten: (result: { ip: string; deleted: number }) => void;
}) {
  const [data, setData] = useState(initial);
  // The ref lets repeated observer callbacks see a start before React commits.
  const pagerRef = useRef<PagerState>(idlePager);
  const [pager, setPager] = useState<PagerState>(idlePager);
  const requests = useRef(0);
  const active = useRef<AbortController | null>(null);
  const consumed = useRef(new Set<string>());
  const sentinel = useRef<HTMLDivElement | null>(null);
  const menu = useContextMenu<string>();
  const [forgetting, setForgetting] = useState<string | null>(null);
  const paging = pager.status === "loading";
  const error =
    pager.status === "failed" || pager.status === "stalled"
      ? pager.message
      : "";
  const requiresRefresh = pager.status === "stalled";

  const dispatch = useCallback((event: PagerEvent) => {
    const next = pagerTransition(pagerRef.current, event);
    pagerRef.current = next;
    setPager(next);
    return next;
  }, []);

  useEffect(() => () => active.current?.abort(), []);

  const loadMore = useCallback(async () => {
    const cursor = data.nextCursor;
    if (!cursor) return;
    const request = ++requests.current;
    const started = dispatch({ type: "start", request });
    if (started.status !== "loading" || started.request !== request) return;
    const controller = new AbortController();
    active.current = controller;
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
        dispatch({
          type: "stalled",
          request,
          message:
            "Could not load older clicks. Use Refresh data to restart this list.",
        });
        return;
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
      dispatch({ type: "loaded", request });
    } catch (cause) {
      if (!controller.signal.aborted)
        dispatch({
          type: "failed",
          request,
          message:
            cause instanceof Error
              ? cause.message
              : "Unable to load more clicks.",
        });
    }
  }, [data.nextCursor, query, dispatch]);

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
          <p>
            Newest first · UTC. IP and approximate location are recorded at
            delivery.
          </p>
        </div>
        <span className="pill">UTC</span>
      </div>
      <div className="table-scroll">
        <table aria-label="Recent clicks" aria-busy={paging}>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Site</th>
              <th scope="col">App</th>
              <th scope="col">Environment</th>
              <th scope="col">IP address</th>
              <th scope="col">Location</th>
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
                <td>
                  <a href={link({ site: event.site })}>{event.site}</a>
                </td>
                <td>
                  <a href={link({ app: event.app })}>
                    {event.app ?? "Unknown"}
                  </a>
                </td>
                <td>
                  <a href={link({ environment: event.environment })}>
                    {event.environment ?? "Unknown"}
                  </a>
                </td>
                <td className="ip-address">
                  {event.ip ? (
                    <a href={link({ ip: event.ip })} {...menu.target(event.ip)}>
                      {event.ip}
                    </a>
                  ) : (
                    <a href={link({ ip: null })}>Unknown</a>
                  )}
                </td>
                <td className="event-location">
                  {event.location ? (
                    <>
                      <a
                        href={link({
                          country: event.location.country,
                          region: event.location.region,
                          regionCode: event.location.regionCode,
                          city: event.location.city,
                        })}
                      >
                        {[
                          event.location.city,
                          event.location.region ?? event.location.regionCode,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Unknown city / region"}
                      </a>
                      <small>
                        <a href={link({ country: event.location.country })}>
                          {countryName(event.location.country)}
                        </a>
                        {event.location.continent
                          ? ` · ${event.location.continent}`
                          : ""}
                      </small>
                      {event.location.timezone && (
                        <small>{event.location.timezone}</small>
                      )}
                    </>
                  ) : (
                    <a href={link({ country: null })}>Unknown</a>
                  )}
                </td>
                <td className="path">
                  <a href={link({ site: event.site, page: event.page })}>
                    {event.page}
                  </a>
                </td>
                <td>
                  <a className="tag" href={link({ target: event.target })}>
                    {event.target}
                  </a>
                </td>
                <td>
                  {event.label ? (
                    <a
                      href={link({ target: event.target, label: event.label })}
                    >
                      {event.label}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
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
      {menu.opened && (
        <ContextMenu
          label={`Actions for ${menu.opened.value}`}
          title={menu.opened.value}
          x={menu.opened.x}
          y={menu.opened.y}
          onClose={menu.close}
          items={ipActions(menu.opened.value)}
        />
      )}
      {forgetting && (
        <ConfirmDialog
          eyebrow="FORGET IP ADDRESS"
          title={
            <>
              Forget <code>{forgetting}</code>?
            </>
          }
          confirmLabel="Forget IP address"
          pendingLabel="Forgetting…"
          onCancel={() => setForgetting(null)}
          onConfirm={async () => {
            const result = await forgetIp(forgetting);
            setForgetting(null);
            onForgotten(result);
          }}
        >
          <p>
            Every retained click recorded from this address is permanently
            deleted, across all sites, apps, environments and dates, not only
            the clicks shown here. This cannot be undone.
          </p>
          <p>Clicks it sends later are recorded as usual.</p>
        </ConfirmDialog>
      )}
    </section>
  );

  function ipActions(ip: string) {
    return [
      {
        label: "Show clicks from this IP",
        icon: "≡",
        onSelect: () => location.assign(link({ ip })),
      },
      {
        label: "Copy IP address",
        icon: "⧉",
        onSelect: () =>
          // Clipboard access is missing outside secure contexts.
          void Promise.resolve()
            .then(() => navigator.clipboard.writeText(ip))
            .then(
              () => notify(`Copied ${ip} to the clipboard.`),
              () => notify("Could not copy to the clipboard."),
            ),
      },
      {
        label: "Forget this IP…",
        icon: "⊘",
        danger: true,
        onSelect: () => setForgetting(ip),
      },
    ];
  }
}
