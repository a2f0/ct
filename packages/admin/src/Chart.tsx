import { count } from "./data";

export function Chart({
  days,
  from,
  to,
}: {
  days: { day: string; clicks: number }[];
  from: number;
  to: number;
}) {
  const totals = new Map(days.map((day) => [day.day, day.clicks]));
  const bars: { day: string; clicks: number }[] = [];
  for (
    let date = Math.floor(from / 86_400_000) * 86_400_000;
    date < to;
    date += 86_400_000
  ) {
    const day = new Date(date).toISOString().slice(0, 10);
    bars.push({ day, clicks: totals.get(day) ?? 0 });
  }
  const max = Math.max(1, ...bars.map((bar) => bar.clicks));
  const width = 900 / Math.max(1, bars.length);
  return (
    <div className="chart">
      <div className="chart-scale">
        <span>{count(max)}</span>
        <span>{count(Math.round(max / 2))}</span>
        <span>0</span>
      </div>
      <svg
        viewBox="0 0 900 180"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily clicks in UTC. ${bars.map((bar) => `${bar.day}: ${bar.clicks}`).join(", ")}`}
      >
        <title>Clicks by day (UTC)</title>
        {[0, 85, 170].map((y) => (
          <line key={y} x1="0" x2="900" y1={y} y2={y} className="grid-line" />
        ))}
        {bars.map((bar, i) => (
          <rect
            key={bar.day}
            x={i * width + width * 0.15}
            y={170 - (160 * bar.clicks) / max}
            width={width * 0.7}
            height={Math.max(2, (160 * bar.clicks) / max)}
            rx={Math.min(5, width * 0.1)}
            className={bar.clicks ? "chart-bar" : "chart-zero"}
          >
            <title>
              {bar.day}: {count(bar.clicks)} clicks
            </title>
          </rect>
        ))}
      </svg>
      <div className="chart-labels">
        <span>{bars[0]?.day}</span>
        <span>{bars[bars.length - 1]?.day}</span>
      </div>
    </div>
  );
}
