import { useCallback, useEffect, useRef, useState } from "react";
import { count, type Events, getData, type Summary } from "./data";
import {
  type Drill,
  drillHref,
  encodeFilters,
  readFilters,
  readScope,
  scopeHeading,
  UNKNOWN,
} from "./filters";
import { nativeDashboard } from "./host";
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
  // Native links give every view a direct URL, reloads, and browser history.
  const view = /^\/recent\/?$/.test(window.location.pathname)
    ? "recent"
    : "overview";
  const [scope] = useState(() =>
    view === "recent" ? readScope(location.search) : {},
  );
  const [initial] = useState(() => readFilters(location.search));
  const [sites, setSites] = useState<string[]>([]);
  const [site, setSite] = useState(initial.site);
  const [apps, setApps] = useState<string[]>([]);
  const [app, setApp] = useState(initial.app);
  const [environment, setEnvironment] = useState(initial.environment);
  const [days, setDays] = useState(initial.days);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const filters = { site, app, environment, days };
  // Navigation keeps the shared filters; only this page's URL keeps its scope.
  const search = encodeFilters(filters);
  const current = encodeFilters(filters, scope);
  const href = (path: string) => `${path}${search}`;
  const link = (drill: Drill) => drillHref(drill, filters);
  const drilled = scopeHeading(scope);
  const heading =
    drilled ??
    (view === "recent"
      ? { eyebrow: "EVERY INTERACTION", title: "Recent clicks" }
      : { eyebrow: "THE BIG PICTURE", title: "Click activity" });
  const name = view === "recent" ? heading.title : "Overview";

  useEffect(() => {
    document.title = `${name} · CT`;
    history.replaceState(null, "", `${location.pathname}${current}`);
  }, [name, current]);

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
    const params = new URLSearchParams({
      site,
      app,
      environment,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    for (const [key, value] of Object.entries(scope))
      params.set(key, value ?? UNKNOWN);
    const query = params.toString();
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
  }, [site, app, environment, days, view, scope]);

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
            className={view === "recent" && !drilled ? "nav-active" : undefined}
            aria-current={view === "recent" && !drilled ? "page" : undefined}
            href={href("/recent")}
          >
            <span aria-hidden="true">≡</span> Recent clicks
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Private · admins only
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
            <p className="eyebrow">{heading.eyebrow}</p>
            <h1>
              {heading.title}
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
        {notice && (
          <div className="notice" role="status">
            {notice}{" "}
            <button type="button" onClick={() => setNotice("")}>
              Dismiss
            </button>
          </div>
        )}
        {view === "overview" ? (
          <Overview
            summary={data?.view === "overview" ? data.summary : null}
            from={data?.from ?? 0}
            to={data?.to ?? 0}
            loading={loading}
            link={link}
          />
        ) : data?.view === "recent" ? (
          <RecentClicks
            key={data.query}
            initial={data.events}
            query={data.query}
            link={link}
            notify={setNotice}
            onForgotten={({ ip, deleted }) => {
              setNotice(
                `Forgot ${ip}: ${count(deleted)} ${deleted === 1 ? "click" : "clicks"} deleted.`,
              );
              void refresh();
            }}
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
            {/* The app shell bundles no desktop browser extensions. */}
            {!nativeDashboard && (
              <>
                Browser opt-out:{" "}
                <a href="/downloads/ct-chrome.zip">Chrome ZIP</a> ·{" "}
                <a href="/downloads/ct-firefox.zip">Firefox ZIP</a> ·{" "}
              </>
            )}
            <a href="/privacy">Privacy policy</a> ·{" "}
            <a href="/support">Support</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
