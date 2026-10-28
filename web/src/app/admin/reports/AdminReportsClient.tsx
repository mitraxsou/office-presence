"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  email: string;
  name: string | null;
  monthPoints: number;
  monthVisitDays: number;
  hoursToday: number;
  officeName: string | null;
  officeLocationId: string | null;
  met?: boolean;
};

type OfficeOpt = { id: string; name: string };

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function MiniDays({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, Math.round((Math.max(0, current) / Math.max(1, target)) * 100));
  return (
    <div className="op-mini">
      <div className="op-mini-track" aria-hidden>
        <div className="op-mini-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="op-mini-label">
        {current} / {target}
      </span>
    </div>
  );
}

export default function AdminReportsClient({
  offices = [],
  initialMonth,
}: {
  offices?: OfficeOpt[];
  initialMonth?: string;
}) {
  const [month, setMonth] = useState(initialMonth || currentMonthKey());
  const [office, setOffice] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [pointsTarget, setPointsTarget] = useState(8);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (office) sp.set("office", office);
    const qs = sp.toString();
    const res = await fetch(`/api/admin/status${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      setPointsTarget(j.pointsTarget ?? 8);
      setRows(
        (j.users ?? []).map((u: Row) => ({
          ...u,
          met: u.monthPoints >= (j.pointsTarget ?? 8),
        })),
      );
    }
    setLoading(false);
  }, [office]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => b.monthPoints - a.monthPoints || (a.name || a.email).localeCompare(b.name || b.email),
      ),
    [rows],
  );

  const stats = useMemo(() => {
    const people = sorted.length;
    const goalMet = sorted.filter((u) => u.monthPoints >= pointsTarget).length;
    return {
      people,
      goalMet,
      below: people - goalMet,
      target: pointsTarget,
    };
  }, [sorted, pointsTarget]);

  const exportHref = `/api/admin/export?kind=reports&month=${encodeURIComponent(month)}${
    office ? `&office=${encodeURIComponent(office)}` : ""
  }`;

  return (
    <div>
      <div className="op-whead">
        <h1>Reports</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div className="op-seg" role="group" aria-label="Month">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              ‹
            </button>
            <span style={{ padding: "0 12px", font: "var(--op-text-label)", fontWeight: 600 }}>{monthLabel(month)}</span>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
              ›
            </button>
          </div>
          <select
            className="op-sel"
            value={office}
            onChange={(e) => setOffice(e.target.value)}
            aria-label="Office filter"
          >
            <option value="">All offices</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <a className="btn btn-primary btn-sm" href={exportHref}>
            Export CSV
          </a>
        </div>
      </div>

      <div className="op-strip op-strip-inline">
        <div>
          <div className="n">{loading ? "-" : stats.people}</div>
          <div className="l">People</div>
        </div>
        <div>
          <div className="n">{loading ? "-" : stats.goalMet}</div>
          <div className="l">Goal met</div>
        </div>
        <div>
          <div className="n">{loading ? "-" : stats.below}</div>
          <div className="l">Below target</div>
        </div>
        <div>
          <div className="n">{stats.target}</div>
          <div className="l">Target points</div>
        </div>
      </div>

      <div className="op-tbl">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Office</th>
              <th className="r">Visits</th>
              <th>Days counted</th>
              <th>Month</th>
              <th className="r">Hours</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7}>
                    <span className="op-sk" style={{ width: "100%", height: 16 }} />
                  </td>
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No people yet.
                </td>
              </tr>
            ) : (
              sorted.map((u) => {
                const met = u.monthPoints >= pointsTarget;
                const toGo = Math.max(0, pointsTarget - u.monthPoints);
                return (
                  <tr key={u.id}>
                    <td className="person-name">{u.name ?? u.email}</td>
                    <td>{u.officeName ?? "-"}</td>
                    <td className="r">{u.monthVisitDays}</td>
                    <td>
                      <MiniDays current={u.monthPoints} target={pointsTarget} />
                    </td>
                    <td>
                      {met ? (
                        <span className="op-badge goal">Goal met</span>
                      ) : (
                        <span className="muted">{toGo} to go</span>
                      )}
                    </td>
                    <td className="r muted">{Math.round(u.hoursToday)} h</td>
                    <td className="r">
                      <a className="btn btn-secondary btn-sm" href={`/admin/people/${u.id}`}>
                        View visits
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
