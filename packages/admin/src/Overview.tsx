import { Chart } from "./Chart";
import { count, type Summary } from "./data";
import { Geography } from "./Geography";

export function Overview({
  summary,
  from,
  to,
  loading,
}: {
  summary: Summary | null;
  from: number;
  to: number;
  loading: boolean;
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
      <Geography geography={summary?.geography} loading={loading} />
      <div className="two-column">
        <section className="card">
          <div className="card-heading">
            <h2>Top pages</h2>
            <span className="muted">CLICKS</span>
          </div>
          <div className="rankings">
            {summary?.pages.map((page, index) => (
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
              <div
                className="rank"
                key={JSON.stringify([target.target, target.label])}
              >
                <span className="target-icon">↖</span>
                <div>
                  <strong>{target.label ?? target.target}</strong>
                  <small>{target.label ? target.target : "Element type"}</small>
                </div>
                <b>{count(target.clicks)}</b>
              </div>
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
