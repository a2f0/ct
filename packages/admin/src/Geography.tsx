import { count, countryName, type Summary } from "./data";

export function Geography({
  geography,
  loading,
}: {
  geography: Summary["geography"] | undefined;
  loading: boolean;
}) {
  const groups = [
    {
      title: "Countries",
      rows: geography?.countries.map((row) => ({
        key: JSON.stringify([row.country]),
        title: countryName(row.country),
        detail: "",
        clicks: row.clicks,
      })),
    },
    {
      title: "States & regions",
      rows: geography?.regions.map((row) => ({
        key: JSON.stringify([row.country, row.region, row.regionCode]),
        title: row.region ?? row.regionCode ?? "Unknown region",
        detail: countryName(row.country),
        clicks: row.clicks,
      })),
    },
    {
      title: "Cities",
      rows: geography?.cities.map((row) => ({
        key: JSON.stringify([
          row.country,
          row.region,
          row.regionCode,
          row.city,
        ]),
        title: row.city ?? "Unknown city",
        detail: [row.region ?? row.regionCode, countryName(row.country)]
          .filter(Boolean)
          .join(" · "),
        clicks: row.clicks,
      })),
    },
  ];
  return (
    <section aria-labelledby="geography-heading" aria-busy={loading}>
      <div className="section-heading">
        <h2 id="geography-heading">Where clicks come from</h2>
        <p>
          Top 20 per dimension. Approximate IP location when clicks are
          delivered; VPNs and mobile networks can differ.
        </p>
      </div>
      <div className="geography-grid">
        {groups.map((group) => (
          <section className="card" key={group.title} aria-label={group.title}>
            <div className="card-heading">
              <h3>{group.title}</h3>
              <span className="muted">CLICKS</span>
            </div>
            <div className="rankings">
              {group.rows?.map((row) => (
                <div className="rank" key={row.key}>
                  <div>
                    <strong>{row.title}</strong>
                    {row.detail && <small>{row.detail}</small>}
                  </div>
                  <b>{count(row.clicks)}</b>
                </div>
              ))}
              {!group.rows?.length && (
                <p className="empty-small">
                  {loading ? "Loading locations…" : "No location activity yet."}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
