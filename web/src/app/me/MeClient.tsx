"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PointsMeter, HoursFyi } from "@/components/PointsMeter";
import { fmtHours, fmtSince, fmtTime } from "@/lib/format";

type Interval = { startAt: string; endAt: string; hours: number; officeName: string | null; source: string };
type Day = {
  dayKey: string;
  points: number;
  hours: number;
  firstIn: string | null;
  lastOut: string | null;
  officeName: string | null;
  intervals: Interval[];
};
type Report = {
  month: string;
  currentMonth: string;
  timezone: string;
  monthPoints: number;
  monthVisitDays: number;
  pointsTarget: number;
  targetMet: boolean;
  dayHoursAdvisory: number;
  today: { inOffice: boolean; sinceAt: string | null; officeName: string | null; hoursToday: number; pointsToday: number };
  days: Day[];
};
type Office = { id: string; name: string; pointsPerVisitDay: number };

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function MeClient({ name }: { name: string }) {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);

  const load = useCallback(async (m: string | null) => {
    setLoading(true);
    const res = await fetch(`/api/me/reports${m ? `?month=${m}` : ""}`, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as Report;
      setData(json);
      if (!m) setMonth(json.month);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  useEffect(() => {
    fetch("/api/offices").then((r) => (r.ok ? r.json() : { offices: [] })).then((j) => setOffices(j.offices ?? []));
  }, []);

  const dayMap = useMemo(() => new Map((data?.days ?? []).map((d) => [d.dayKey, d])), [data]);
  const todayKey = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: data?.timezone ?? "Asia/Kolkata" }).format(new Date()),
    [data?.timezone],
  );

  const cells = useMemo(() => {
    if (!month) return [];
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const lead = (first + 6) % 7;
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
    return out;
  }, [month]);

  const sel = selected ? dayMap.get(selected) : undefined;

  return (
    <>
      <div className="card card-brand">
        <span className="card-title">My month</span>
        <h1>{name}</h1>
        {loading && !data ? (
          <>
            <span className="skeleton" style={{ height: 48, width: 160, marginTop: 12 }} />
            <span className="skeleton" style={{ height: 12, marginTop: 12 }} />
            <span className="skeleton" style={{ height: 32, width: 220, marginTop: 20 }} />
          </>
        ) : data ? (
          <>
            <PointsMeter points={data.monthPoints} target={data.pointsTarget} />
            <p className="muted" style={{ margin: "0.4rem 0 0" }}>
              {data.monthVisitDays} visit day{data.monthVisitDays === 1 ? "" : "s"} in {data.month}
            </p>
            {data.month === data.currentMonth ? (
              <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                <div className="stat">
                  <span className="stat-label">Status</span>
                  <span className={`stat-value ${data.today.inOffice ? "ok" : "muted"}`}>
                    {data.today.inOffice ? `In${data.today.officeName ? ` at ${data.today.officeName}` : ""}` : "Out"}
                  </span>
                  {data.today.inOffice ? <div className="muted">since {fmtSince(data.today.sinceAt, data.timezone)}</div> : null}
                </div>
                <div className="stat">
                  <HoursFyi hours={data.today.hoursToday} advised={data.dayHoursAdvisory} />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="status-msg error">Could not load your month.</p>
        )}
      </div>

      <div className="card">
        <div className="cal-head">
          <button className="btn btn-secondary btn-sm" onClick={() => month && setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            Prev
          </button>
          <h2 style={{ margin: 0 }}>{month ?? ""}</h2>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => month && setMonth(shiftMonth(month, 1))}
            disabled={!data || month === data.currentMonth}
            aria-label="Next month"
          >
            Next
          </button>
        </div>
        <div className="cal-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="cal-dow">{d}</div>
          ))}
          {loading
            ? cells.map((c, i) => <span key={i} className={c ? "skeleton" : "cal-day empty"} style={{ aspectRatio: "1 / 1" }} />)
            : cells.map((c, i) => {
                if (!c) return <div key={i} className="cal-day empty" />;
                const d = dayMap.get(c);
                return (
                  <button
                    key={c}
                    className={`cal-day ${selected === c ? "selected" : ""} ${c === todayKey ? "today" : ""}`}
                    onClick={() => setSelected(c)}
                    aria-label={`${c}${d ? `, ${d.points} points` : ""}`}
                  >
                    <span>{Number(c.slice(8))}</span>
                    {d ? <span className="cal-dot" /> : null}
                    {d ? <span className="cal-pts">+{d.points}</span> : null}
                  </button>
                );
              })}
        </div>
      </div>

      {selected ? (
        <DayDetail key={selected} dayKey={selected} day={sel} timezone={data?.timezone ?? "Asia/Kolkata"} offices={offices} onSaved={() => load(month)} />
      ) : (
        <p className="help">Select a day to see intervals, first in, last out, and which office&apos;s points counted.</p>
      )}
    </>
  );
}

function DayDetail({
  dayKey,
  day,
  timezone,
  offices,
  onSaved,
}: {
  dayKey: string;
  day?: Day;
  timezone: string;
  offices: Office[];
  onSaved: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [inTime, setInTime] = useState("09:30");
  const [outTime, setOutTime] = useState("17:30");
  const [officeId, setOfficeId] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg(null);
    const offset = timezone === "Asia/Kolkata" ? "+05:30" : "Z";
    const start = new Date(`${dayKey}T${inTime}:00${offset}`);
    let end = new Date(`${dayKey}T${outTime}:00${offset}`);
    if (end <= start) end = new Date(end.getTime() + 24 * 3600_000);
    const res = await fetch("/api/me/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayKey,
        proposedStart: start.toISOString(),
        proposedEnd: end.toISOString(),
        reason,
        officeLocationId: officeId || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: "Correction sent to admin. Points update after approval." });
      setShowForm(false);
      onSaved();
    } else setMsg({ kind: "error", text: json.error ?? "Could not send" });
  }

  return (
    <div className="card">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{dayKey}</h2>
        {day ? <span className="badge badge-orange">+{day.points} point{day.points === 1 ? "" : "s"}</span> : <span className="muted">No visit</span>}
      </div>
      {day ? (
        <>
          <div className="grid-2" style={{ marginTop: "0.75rem" }}>
            <p style={{ margin: 0 }}><span className="muted">First in</span> {fmtTime(day.firstIn, timezone)}</p>
            <p style={{ margin: 0 }}><span className="muted">Last out</span> {fmtTime(day.lastOut, timezone)}</p>
            <p style={{ margin: 0 }}><span className="muted">Hours (FYI)</span> {fmtHours(day.hours)}</p>
            <p style={{ margin: 0 }}><span className="muted">Points from</span> {day.officeName ?? "Office"}</p>
          </div>
          <div className="table-scroll" style={{ marginTop: "0.75rem" }}>
            <table>
              <thead>
                <tr><th>In</th><th>Out</th><th>Hours</th><th>Office</th><th>Source</th></tr>
              </thead>
              <tbody>
                {day.intervals.map((iv, i) => (
                  <tr key={i}>
                    <td>{fmtTime(iv.startAt, timezone)}</td>
                    <td>{fmtTime(iv.endAt, timezone)}</td>
                    <td>{fmtHours(iv.hours)}</td>
                    <td>{iv.officeName ?? "-"}</td>
                    <td>{iv.source === "admin" ? "Edited by admin" : iv.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <div className="btn-row" style={{ marginTop: "0.75rem" }}>
        <button className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Request correction"}
        </button>
      </div>
      {showForm ? (
        <div className="form-stack" style={{ marginTop: "0.75rem" }}>
          <div className="grid-2">
            <div>
              <label htmlFor="cin">Check-in</label>
              <input id="cin" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="cout">Check-out</label>
              <input id="cout" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </div>
          </div>
          <label htmlFor="coff">Office</label>
          <select id="coff" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            <option value="">Choose office</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.pointsPerVisitDay} pt)</option>
            ))}
          </select>
          <label htmlFor="creason">Reason</label>
          <input id="creason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Phone was off" />
          <div className="btn-row">
            <button className="btn btn-primary" disabled={busy || !reason.trim()} onClick={submit}>
              {busy ? "Sending..." : "Send correction"}
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <p className={`status-msg ${msg.kind}`}>{msg.text}</p> : null}
    </div>
  );
}
