import { useCallback, useEffect, useRef, useState } from "react";
import { type Events, getData, type Summary } from "./data";
import { Overview } from "./Overview";
import { RecentClicks } from "./RecentClicks";
import { SignOut } from "./SignOut";
import { ThemeSwitch } from "./ThemeSwitch";

type Report = {
  from: number;
  to: number;
  query: string;
  site: string;
  days: number;
  app: string;
  environment: string;
  updated: number;
} & (
  | { view: "overview"; summary: Summary }
  | { view: "recent"; events: Events }
);

export function App() {
  // Native links give both views direct URLs, reloads, and browser history.
  const view = /^\/recent\/?$/.test(window.location.pathname)
    ? "recent"
    : "overview";
  const [sites, setSites] = useState<string[]>([]);
  const [site, setSite] = useState(
    () => new URLSearchParams(location.search).get("site") ?? "",
  );
  const [apps, setApps] = useState<string[]>([]);
  const [app, setApp] = useState(() => {
    const value = new URLSearchParams(location.search).get("app") ?? "";
    return value === "~unknown" || /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
      ? value
      : "";
  });
  const [environment, setEnvironment] = useState(() => {
    const value = new URLSearchParams(location.search).get("environment") ?? "";
    return value === "all"
      ? ""
      : ["production", "staging", "~unknown"].includes(value)
        ? value
        : "production";
  });
  const [days, setDays] = useState(() => {
    const value = Number(new URLSearchParams(location.search).get("days"));
    return [1, 7, 30, 90].includes(value) ? value : 7;
  });
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const filters = new URLSearchParams();
  if (site) filters.set("site", site);
  if (app) filters.set("app", app);
  if (environment !== "production")
    filters.set("environment", environment || "all");
  if (days !== 7) filters.set("days", String(days));
  const encodedFilters = filters.toString();
  const search = encodedFilters ? `?${encodedFilters}` : "";
  const href = (path: string) => `${path}${search}`;

  useEffect(() => {
    document.title = `${view === "overview" ? "Overview" : "Recent clicks"} · CT`;
    history.replaceState(null, "", `${location.pathname}${search}`);
  }, [view, search]);

  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    setData((current) =>
      current?.view === "overview" &&
      current.site === site &&
      current.days === days &&
      current.app === app &&
      current.environment === environment
        ? current
        : null,
    );
    const to = Date.now();
    const from = to - days * 86_400_000;
    const query = new URLSearchParams({
      site,
      app,
      environment,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    }).toString();
    try {
      const report =
        view === "overview"
          ? getData<Summary>(`/api/summary?${query}`, controller.signal).then(
              (summary) => ({ view: "overview" as const, summary }),
            )
          : getData<Events>(`/api/events?${query}`, controller.signal).then(
              (events) => ({ view: "recent" as const, events }),
            );
      const metadata = getData<{ sites: string[]; apps: string[] }>(
        "/api/sites",
        controller.signal,
      ).then((result) => {
        if (!controller.signal.aborted) {
          setSites(result.sites);
          setApps(result.apps ?? []);
          if (site && !result.sites.includes(site)) setSite("");
        }
      });
      const [result] = await Promise.all([report, metadata]);
      if (controller.signal.aborted) return;
      setData({
        ...result,
        from,
        to,
        query,
        site,
        app,
        environment,
        days,
        updated: Date.now(),
      });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Unable to load data.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [site, app, environment, days, view]);

  useEffect(() => {
    void refresh();
    return () => active.current?.abort();
  }, [refresh]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href={href("/")} aria-label="CT home">
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
          <a
            className={view === "overview" ? "nav-active" : undefined}
            aria-current={view === "overview" ? "page" : undefined}
            href={href("/")}
          >
            <span aria-hidden="true">▥</span> Overview
          </a>
          <a
            className={view === "recent" ? "nav-active" : undefined}
            aria-current={view === "recent" ? "page" : undefined}
            href={href("/recent")}
          >
            <span aria-hidden="true">≡</span> Recent clicks
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Private · read only
          <p>
            Authenticated access. No visitor profiles.
            <br />
            Just where the clicks land.
          </p>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>WORKSPACE / ANALYTICS</span>
          <div className="topbar-actions">
            <span className="pill">90-day retention</span>
            <ThemeSwitch />
            <a href="/account">Account</a>
            <SignOut />
          </div>
        </header>
        <section className="heading">
          <div>
            <p className="eyebrow">
              {view === "overview" ? "THE BIG PICTURE" : "EVERY INTERACTION"}
            </p>
            <h1>
              {view === "overview" ? "Click activity" : "Recent clicks"}
              <span>.</span>
            </h1>
            <p className="subtitle">
              {view === "overview"
                ? "A little signal from every interaction."
                : "Explore clicks as they happened. Scroll for older activity."}
            </p>
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
                setSite(event.target.value);
              }}
            >
              <option value="">All sites</option>
              {sites.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            App
            <select
              value={app}
              onChange={(event) => setApp(event.target.value)}
            >
              <option value="">All apps</option>
              <option value="~unknown">Unknown app</option>
              {[
                ...new Set([
                  ...apps,
                  ...(app && app !== "~unknown" ? [app] : []),
                ]),
              ]
                .sort()
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </select>
          </label>
          <label>
            Environment
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="">All environments</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="~unknown">Unknown environment</option>
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
                  setDays(value);
                }}
              >
                {value === 1 ? "24 hours" : `${value} days`}
              </button>
            ))}
          </fieldset>
          <span className="updated">
            {data
              ? `Updated ${new Date(data.updated).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`
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
        {view === "overview" ? (
          <Overview
            summary={data?.view === "overview" ? data.summary : null}
            from={data?.from ?? 0}
            to={data?.to ?? 0}
            loading={loading}
          />
        ) : data?.view === "recent" ? (
          <RecentClicks
            key={data.query}
            initial={data.events}
            query={data.query}
          />
        ) : (
          <div className="card placeholder" role="status">
            {loading ? "Loading recent clicks…" : "Recent clicks unavailable"}
          </div>
        )}
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
