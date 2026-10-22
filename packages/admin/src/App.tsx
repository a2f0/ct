import { useCallback, useEffect, useRef, useState } from "react";
import { Chart } from "./Chart";
import { count, type Events, getData, type Summary, time } from "./data";

export function App() {
  const [sites, setSites] = useState<string[]>([]);
  const [site, setSite] = useState("");
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{
    summary: Summary;
    events: Events;
    from: number;
    to: number;
    query: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<number | null>(null);
  const [paging, setPaging] = useState(false);
  const active = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    setPaging(false);
    const to = Date.now();
    const from = to - days * 86_400_000;
    const query = new URLSearchParams({
      site,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    }).toString();
    try {
      const [summary, events, metadata] = await Promise.all([
        getData<Summary>(`/api/summary?${query}`, controller.signal),
        getData<Events>(`/api/events?${query}`, controller.signal),
        getData<{ sites: string[] }>("/api/sites", controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setSites(metadata.sites);
      setData({ summary, events, from, to, query });
      setUpdated(Date.now());
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Unable to load data.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [site, days]);

  useEffect(() => {
    void refresh();
    return () => active.current?.abort();
  }, [refresh]);

  async function loadMore() {
    if (!data?.events.nextCursor || paging) return;
    const snapshot = data;
    setPaging(true);
    try {
      const next = await getData<Events>(
        `/api/events?${data.query}&cursor=${encodeURIComponent(data.events.nextCursor)}`,
        active.current?.signal,
      );
      setData((current) =>
        current === snapshot
          ? {
              ...current,
              events: {
                events: [...current.events.events, ...next.events],
                nextCursor: next.nextCursor,
              },
            }
          : current,
      );
    } catch (cause) {
      if (!active.current?.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Unable to load more.",
        );
    } finally {
      setPaging(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="CT home">
          <span className="brand-mark">↖</span>
          <span>
            ct<span className="brand-dot">.</span>
          </span>
        </a>
        <p className="sidebar-caption">
          SMALL SIGNALS.
          <br />
          CLEARER PICTURE.
        </p>
        <nav aria-label="Main">
          <a className="nav-active" href="#overview">
            <span>▥</span> Overview <span className="nav-arrow">↗</span>
          </a>
          <a href="#recent">
            <span>≡</span> Recent clicks
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Public · read only
          <p>
            No accounts. No visitor profiles.
            <br />
            Just where the clicks land.
          </p>
        </div>
      </aside>
      <main id="overview">
        <header className="topbar">
          <span>WORKSPACE / ANALYTICS</span>
          <span className="pill">90-day retention</span>
        </header>
        <section className="heading">
          <div>
            <p className="eyebrow">THE BIG PICTURE</p>
            <h1>
              Click activity<span>.</span>
            </h1>
            <p className="subtitle">A little signal from every interaction.</p>
          </div>
          <button
            className="refresh"
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? "Refreshing…" : "↻  Refresh data"}
          </button>
        </section>
        <div className="filters">
          <label>
            Site
            <select
              value={site}
              onChange={(event) => {
                setData(null);
                setSite(event.target.value);
              }}
            >
              <option value="">All sites</option>
              {sites.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="sr-only">Time range</legend>
            {[1, 7, 30, 90].map((value) => (
              <button
                key={value}
                type="button"
                className={days === value ? "selected" : ""}
                aria-pressed={days === value}
                onClick={() => {
                  setData(null);
                  setDays(value);
                }}
              >
                {value === 1 ? "24 hours" : `${value} days`}
              </button>
            ))}
          </fieldset>
          <span className="updated">
            {updated
              ? `Updated ${new Date(updated).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`
              : "Waiting for data"}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button type="button" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}
        <div className="metrics" aria-busy={loading}>
          {[
            [
              "Total clicks",
              data?.summary.totals.clicks,
              "Every recorded interaction",
            ],
            [
              "Active sites",
              data?.summary.totals.sites,
              "Sites with clicks in this range",
            ],
            [
              "Pages clicked",
              data?.summary.totals.pages,
              "Distinct site and route pairs",
            ],
          ].map(([label, value, caption]) => (
            <section className="metric" key={label}>
              <p>{label}</p>
              <strong>{typeof value === "number" ? count(value) : "—"}</strong>
              <span>{caption}</span>
            </section>
          ))}
        </div>
        <section className="card trend">
          <div className="card-heading">
            <div>
              <h2>Activity over time</h2>
              <p>Daily clicks · UTC</p>
            </div>
            <span className="chart-key">
              <i /> Clicks
            </span>
          </div>
          {data ? (
            <Chart days={data.summary.daily} from={data.from} to={data.to} />
          ) : (
            <div className="placeholder">
              {loading ? "Loading activity…" : "Activity unavailable"}
            </div>
          )}
          {data?.summary.totals.clicks === 0 && (
            <p className="empty-note">
              No clicks in this range. New activity will appear after a site
              initializes the tracker.
            </p>
          )}
        </section>
        <div className="two-column">
          <section className="card">
            <div className="card-heading">
              <h2>Top pages</h2>
              <span className="muted">CLICKS</span>
            </div>
            <div className="rankings">
              {data?.summary.pages.map((page, index) => (
                <div className="rank" key={`${page.site}:${page.page}`}>
                  <span className="rank-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{page.page}</strong>
                    <small>{page.site}</small>
                  </div>
                  <b>{count(page.clicks)}</b>
                </div>
              ))}
              {!data?.summary.pages.length && (
                <p className="empty-small">No page activity yet.</p>
              )}
            </div>
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>What gets clicked</h2>
              <span className="muted">CLICKS</span>
            </div>
            <div className="rankings">
              {data?.summary.targets.map((target) => (
                <div className="rank" key={`${target.target}:${target.label}`}>
                  <span className="target-icon">↖</span>
                  <div>
                    <strong>{target.label ?? target.target}</strong>
                    <small>
                      {target.label ? target.target : "Element type"}
                    </small>
                  </div>
                  <b>{count(target.clicks)}</b>
                </div>
              ))}
              {!data?.summary.targets.length && (
                <p className="empty-small">No targets recorded yet.</p>
              )}
            </div>
          </section>
        </div>
        <section className="card recent" id="recent">
          <div className="card-heading">
            <div>
              <h2>Recent clicks</h2>
              <p>A closer look at the latest activity.</p>
            </div>
            <span className="pill">UTC</span>
          </div>
          <div className="table-scroll">
            <table>
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
                {data?.events.events.map((event) => (
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
          {!data?.events.events.length && (
            <p className="empty-small">
              {loading ? "Loading recent clicks…" : "No clicks to show."}
            </p>
          )}
          {data?.events.nextCursor && (
            <button
              className="load-more"
              disabled={paging || loading}
              type="button"
              onClick={() => void loadMore()}
            >
              {paging ? "Loading…" : "Load 100 more"}
            </button>
          )}
        </section>
        <footer>
          <span>
            ct. <span className="muted">Keep it simple. Make it count.</span>
          </span>
          <span className="downloads">
            Browser opt-out: <a href="/downloads/ct-chrome.zip">Chrome ZIP</a> ·{" "}
            <a href="/downloads/ct-firefox.zip">Firefox ZIP</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
