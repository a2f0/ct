import { Chart } from "./Chart";
import { count, type Summary } from "./data";
import type { Link } from "./filters";
import { Geography } from "./Geography";

export function Overview({
  summary,
  from,
  to,
  loading,
  link,
}: {
  summary: Summary | null;
  from: number;
  to: number;
  loading: boolean;
  link: Link;
}) {
  return (
    <>
      <div className="metrics" aria-busy={loading}>
        {[
          [
            "Total clicks",
            summary?.totals.clicks,
            "Every recorded interaction",
          ],
          [
            "Active sites",
            summary?.totals.sites,
            "Sites with clicks in this range",
          ],
          [
            "Pages clicked",
            summary?.totals.pages,
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
        {summary ? (
          <Chart days={summary.daily} from={from} to={to} />
        ) : (
          <div className="placeholder">
            {loading ? "Loading activity…" : "Activity unavailable"}
          </div>
        )}
        {summary?.totals.clicks === 0 && (
          <p className="empty-note">
            No clicks in this range. New activity will appear after a site
            initializes the tracker.
          </p>
        )}
      </section>
      <div className="two-column">
        {[
          {
            title: "Apps",
            rows: summary?.apps?.map((row) => ({
              name: row.app,
              href: link({ app: row.app }),
              clicks: row.clicks,
            })),
          },
          {
            title: "Environments",
            rows: summary?.environments?.map((row) => ({
              name: row.environment,
              href: link({ environment: row.environment }),
              clicks: row.clicks,
            })),
          },
        ].map(({ title, rows }) => (
          <section className="card" aria-label={title} key={title}>
            <div className="card-heading">
              <h2>{title}</h2>
              <span className="muted">CLICKS</span>
            </div>
            <div className="rankings">
              {rows?.map((row) => (
                <a
                  className="rank"
                  href={row.href}
                  key={row.name ?? "~unknown"}
                >
                  <span className="target-icon">↖</span>
                  <strong>{row.name ?? "Unknown"}</strong>
                  <b>{count(row.clicks)}</b>
                </a>
              ))}
              {!rows?.length && (
                <p className="empty-small">
                  {loading ? "Loading activity…" : "No activity in this range."}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      <Geography geography={summary?.geography} loading={loading} link={link} />
      <div className="two-column">
        <section className="card">
          <div className="card-heading">
            <h2>Top pages</h2>
            <span className="muted">CLICKS</span>
          </div>
          <div className="rankings">
            {summary?.pages.map((page, index) => (
              <a
                className="rank"
                href={link({ site: page.site, page: page.page })}
                key={`${page.site}:${page.page}`}
              >
                <span className="rank-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{page.page}</strong>
                  <small>{page.site}</small>
                </div>
                <b>{count(page.clicks)}</b>
              </a>
            ))}
            {!summary?.pages.length && (
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
            {summary?.targets.map((target) => (
              <a
                className="rank"
                href={link({ target: target.target, label: target.label })}
                key={JSON.stringify([target.target, target.label])}
              >
                <span className="target-icon">↖</span>
                <div>
                  <strong>{target.label ?? target.target}</strong>
                  <small>{target.label ? target.target : "Element type"}</small>
                </div>
                <b>{count(target.clicks)}</b>
              </a>
            ))}
            {!summary?.targets.length && (
              <p className="empty-small">No targets recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
