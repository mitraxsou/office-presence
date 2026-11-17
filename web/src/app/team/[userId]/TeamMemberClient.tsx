"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Day = {
  dayKey: string;
  points: number;
  officeName: string | null;
  firstIn: string | null;
  lastOut: string | null;
  exception: { points: number; officeName: string } | null;
};
type Month = {
  person: { id: string; name: string; teamName: string | null; inOffice: boolean; officeName: string | null };
  month: string;
  currentMonth: string;
  timezone: string;
  monthPoints: number;
  monthVisitDays: number;
  pointsTarget: number;
  targetMet: boolean;
  exceptionDayCount: number;
  days: Day[];
  holidays: { dayKey: string; name: string }[];
  leaveDays: { dayKey: string; kind: string }[];
  corrections: { id: string; dayKey: string; status: string; createdAt: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  auto_approved: "Approved",
  rejected: "Not approved",
  reverted: "Reverted by an admin",
  cancelled: "Cancelled",
};

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function pts(n: number) {
  const r = Math.max(0, Math.round(n));
  return r === 1 ? "1 point" : `${r} points`;
}

export default function TeamMemberClient({ userId }: { userId: string }) {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Month | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    const qs = month ? `?month=${month}` : "";
    const res = await fetch(`/api/team/people/${encodeURIComponent(userId)}/month${qs}`, { cache: "no-store" });
    if (res.status === 403 || res.status === 404) {
      setState("forbidden");
      return;
    }
    if (!res.ok) {
      setState("error");
      return;
    }
    const j = (await res.json()) as Month;
    setData(j);
    setState("ok");
  }, [userId, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const time = useCallback(
    (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: data?.timezone })
        : "",
    [data?.timezone],
  );

  const view = useMemo(() => {
    if (!data) return null;
    const [y, m] = data.month.split("-").map(Number);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) cells.push(`${data.month}-${String(d).padStart(2, "0")}`);
    return {
      cells,
      days: new Map(data.days.map((d) => [d.dayKey, d])),
      holidays: new Map(data.holidays.map((h) => [h.dayKey, h.name])),
      leave: new Map(data.leaveDays.map((l) => [l.dayKey, l.kind])),
    };
  }, [data]);

  if (state === "forbidden") {
    return (
      <div className="op-empty">
        <h2>Not in your team</h2>
        <p>You can see people who report to you, and members of teams you lead.</p>
        <div style={{ marginTop: 20 }}>
          <a className="btn btn-secondary btn-sm" href="/team">
            Back to My team
          </a>
        </div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="op-empty">
        <h2>Could not load</h2>
        <p>This month did not load. Try again.</p>
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!data || !view) {
    return (
      <div className="card">
        <span className="skeleton" style={{ height: 260, display: "block" }} />
      </div>
    );
  }

  const pct = Math.min(100, Math.round((Math.max(0, data.monthPoints) / Math.max(1, data.pointsTarget)) * 100));
  const togo = Math.max(0, data.pointsTarget - Math.round(data.monthPoints));
  const listed = data.days.filter((d) => d.points > 0 || d.exception).slice().reverse();

  return (
    <>
      <div className="op-whead">
        <div>
          <a className="op-ghost" href="/team">
            ‹ My team
          </a>
          <h1>{data.person.name}</h1>
          <p className="op-sub">
            {data.person.teamName ? `${data.person.teamName}. ` : ""}
            {data.person.inOffice ? `In ${data.person.officeName ?? ""}` : "Out"}
          </p>
        </div>
        <div className="op-seg" role="group" aria-label="Month">
          <button type="button" onClick={() => setMonth(shiftMonth(data.month, -1))} aria-label="Previous month">
            ‹
          </button>
          <button type="button" className="on">
            {monthLabel(data.month)}
          </button>
          <button
            type="button"
            disabled={data.month >= data.currentMonth}
            onClick={() => setMonth(shiftMonth(data.month, 1))}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="op-readonly-note" role="note">
        Read only. Ask an admin to change visits.
      </div>

      <div className="card op-days-card" style={{ marginBottom: 16 }}>
        <div className="op-days-row">
          <div>
            <span className="op-days-num">{Math.round(data.monthPoints)}</span>
            <span className="op-days-den"> / {data.pointsTarget} points</span>
          </div>
          {data.targetMet ? <span className="op-badge goal">Goal met</span> : <span className="op-days-togo">{togo} to go</span>}
        </div>
        <div className="op-days-track" aria-hidden>
          <div className="op-days-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="op-meta" style={{ marginTop: 10 }}>
          {data.monthVisitDays === 1 ? "1 visit day" : `${data.monthVisitDays} visit days`}
        </p>
        {data.exceptionDayCount > 0 ? (
          <p className="op-meta" style={{ marginTop: 4 }}>
            Includes {data.exceptionDayCount} HR exception {data.exceptionDayCount === 1 ? "day" : "days"}
          </p>
        ) : null}
      </div>

      <div className="op-wcal" aria-label="Month calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="op-wcal-h">
            {d}
          </div>
        ))}
        {view.cells.map((c, i) => {
          if (!c) return <div key={i} className="op-wcal-d blank" />;
          const d = view.days.get(c);
          const visit = !!d && d.points > 0 && !!d.firstIn;
          const ex = d?.exception ?? null;
          const hol = view.holidays.get(c);
          const lv = view.leave.get(c);
          const cls = ["op-wcal-d", visit ? "has-visit" : "", ex ? "ex" : "", hol ? "hol" : "", lv ? "lv" : ""]
            .filter(Boolean)
            .join(" ");
          const sub = visit
            ? d?.officeName ?? ""
            : ex
              ? "HR exception"
              : hol
                ? hol
                : lv
                  ? lv === "other_duty"
                    ? "Other duty"
                    : "Leave"
                  : "";
          return (
            <div key={c} className={cls}>
              <span>{Number(c.slice(8))}</span>
              <div className="op-wcal-body">
                {d && d.points > 0 ? <span className="op-wcal-chip">{pts(d.points)}</span> : null}
                {sub ? <span className="op-wcal-of">{sub}</span> : null}
              </div>
            </div>
          );
        })}
        <div className="op-wcal-legend" aria-label="Legend">
          <span>
            <i className="visit" />
            Visit day
          </span>
          <span>
            <i className="ex" />
            HR exception
          </span>
          <span>
            <i className="hol" />
            Holiday (info)
          </span>
          <span>
            <i className="lv" />
            Leave (info)
          </span>
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>Days</h2>
      {listed.length === 0 ? (
        <p className="op-meta">No visit days yet this month.</p>
      ) : (
        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Office</th>
                <th>First In</th>
                <th>Last Out</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((d) => (
                <tr key={d.dayKey}>
                  <td>{dayLabel(d.dayKey)}</td>
                  <td>
                    {d.firstIn ? d.officeName ?? "" : ""}
                    {d.exception ? <div className="op-meta">HR exception, {d.exception.officeName}</div> : null}
                  </td>
                  <td className="tab">{time(d.firstIn)}</td>
                  <td className="tab">{d.firstIn && !d.lastOut ? "In now" : time(d.lastOut)}</td>
                  <td className="tab">{pts(d.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.corrections.length ? (
        <>
          <h2 style={{ marginTop: 24 }}>Correction requests</h2>
          <div className="op-tbl">
            <table>
              <tbody>
                {data.corrections.map((c) => (
                  <tr key={c.id}>
                    <td>{dayLabel(c.dayKey)}</td>
                    <td>
                      <span className="op-badge">{STATUS_LABEL[c.status] ?? c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
