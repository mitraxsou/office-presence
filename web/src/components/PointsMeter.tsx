import { fmtHours } from "@/lib/format";

export function PointsMeter({ points, target }: { points: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (points / target) * 100) : 100;
  const met = points >= target;
  return (
    <div className="meter" aria-label={`${points} of ${target} office points`}>
      <span className="stat-label">Office points this month</span>
      <div className="meter-head">
        <span className="meter-value">{points}</span>
        <span className="meter-target">/ {target}</span>
        {met ? <span className="badge badge-in">Goal met</span> : <span className="muted">{target - points} to go</span>}
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${met ? "met" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** FYI only: hours never gate points and there is no fail state. */
export function HoursFyi({ hours, advised }: { hours: number; advised: number }) {
  const pct = advised > 0 ? Math.min(100, (hours / advised) * 100) : 0;
  return (
    <div className="meter meter-fyi">
      <span className="stat-label">Hours today (FYI, advised {advised}h)</span>
      <div className="meter-head">
        <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>{fmtHours(hours)}</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
