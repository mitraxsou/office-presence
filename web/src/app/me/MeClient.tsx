"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { daysMeterLabel } from "@/lib/days-format";
import {
  dayTitle,
  fmtDurationSince,
  fmtHours,
  fmtTime,
  monthTitle,
} from "@/lib/format";
import { calendarOfficeLabel, groupOfficesFromIntervals, travelMinutes } from "@/lib/office-day";
import { DayTimeline } from "@/components/op/DayTimeline";

type Interval = {
  startAt: string;
  endAt: string;
  hours: number;
  officeName: string | null;
  officeId?: string | null;
  source: string;
};
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
  today: {
    inOffice: boolean;
    sinceAt: string | null;
    officeName: string | null;
    hoursToday: number;
    pointsToday: number;
  };
  days: Day[];
};
type Office = { id: string; name: string; pointsPerVisitDay: number };
type CorrectionRow = { id: string; dayKey: string; status: string };

const ISSUES: { id: "missing_visit" | "wrong_times" | "wrong_office" | "should_not_count"; title: string; hint: string }[] = [
  { id: "missing_visit", title: "A visit is missing", hint: "I was in the office, but no visit is shown" },
  { id: "wrong_times", title: "Times are wrong", hint: "A visit started or ended at another time" },
  { id: "wrong_office", title: "Wrong office", hint: "The visit was at a different office" },
  { id: "should_not_count", title: "This day should not count", hint: "I was not in the office that day" },
];

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function chipLabel(points: number) {
  const n = Math.max(0, Math.round(points));
  return n === 1 ? "1 day" : `${n} days`;
}

export default function MeClient({
  name: _name,
  greetingText,
  greetingDate,
  viewAs,
}: {
  name: string;
  greetingText?: string;
  greetingDate?: string;
  viewAs?: { mode: "readonly" | "full"; name: string } | null;
}) {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [offices, setOffices] = useState<Office[]>([]);
  const [pendingDays, setPendingDays] = useState<Set<string>>(new Set());
  const viewAsReadonly = viewAs?.mode === "readonly";

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

  const loadCorrections = useCallback(async (m: string | null) => {
    if (!m) return;
    const res = await fetch(`/api/me/corrections?month=${m}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { requests?: CorrectionRow[] };
    const pending = new Set(
      (json.requests ?? []).filter((r) => r.status === "pending").map((r) => r.dayKey),
    );
    setPendingDays(pending);
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  useEffect(() => {
    void loadCorrections(month);
  }, [month, loadCorrections]);

  useEffect(() => {
    fetch("/api/offices")
      .then((r) => (r.ok ? r.json() : { offices: [] }))
      .then((j) => setOffices(j.offices ?? []));
  }, []);

  const dayMap = useMemo(() => new Map((data?.days ?? []).map((d) => [d.dayKey, d])), [data]);
  const tz = data?.timezone ?? "Asia/Kolkata";
  const todayKey = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()),
    [tz],
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
  const meter = data ? daysMeterLabel(data.monthPoints, data.pointsTarget) : null;
  const pct = data
    ? Math.min(100, Math.round((Math.max(0, data.monthPoints) / Math.max(1, data.pointsTarget)) * 100))
    : 0;
  const sinceDur = data?.today.sinceAt ? fmtDurationSince(data.today.sinceAt) : null;
  const sinceTime = data?.today.sinceAt ? fmtTime(data.today.sinceAt, tz) : null;

  function openDay(dayKey: string) {
    setSelected(dayKey);
    setCorrecting(false);
  }

  function closeDrawer() {
    setSelected(null);
    setCorrecting(false);
  }

  return (
    <>
      {greetingText ? (
        <div className="op-greeting-block">
          <div className="op-greeting">{greetingText}</div>
          {greetingDate ? <div className="op-greeting-date">{greetingDate}</div> : null}
        </div>
      ) : null}
      <div className="op-whead">
        <div className="op-month-nav">
          <button
            type="button"
            className="op-icon-btn"
            aria-label="Previous month"
            onClick={() => month && setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <h1 className="op-page-title">{month ? monthTitle(month) : "My month"}</h1>
          <button
            type="button"
            className="op-icon-btn"
            aria-label="Next month"
            disabled={!data || month === data.currentMonth}
            onClick={() => month && setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
        <span className="op-meta">Times in {tz}</span>
      </div>

      <div className="op-month-grid">
        <div className="op-month-side">
          {loading && !data ? (
            <>
              <div className="card">
                <span className="skeleton" style={{ height: 72, width: 120 }} />
                <span className="skeleton" style={{ height: 20, marginTop: 16, width: "80%" }} />
              </div>
              <div className="card">
                <span className="skeleton" style={{ height: 56, width: 160 }} />
                <span className="skeleton" style={{ height: 10, marginTop: 16 }} />
              </div>
            </>
          ) : data ? (
            <>
              <div className="card op-status-card">
                <div className="op-status-row-web">
                  <span className="op-status-word-web">{data.today.inOffice ? "In" : "Out"}</span>
                  <span className={`op-status-dot ${data.today.inOffice ? "in" : "out"}`} aria-hidden />
                </div>
                <div className="op-status-office">
                  {data.today.inOffice ? data.today.officeName || "Office" : "Not at an office"}
                </div>
                <div className="op-status-since">
                  {sinceDur && sinceTime
                    ? `For ${sinceDur}, since ${sinceTime}`
                    : data.today.inOffice
                      ? "In now"
                      : "Out"}
                </div>
              </div>

              <div className="card op-days-card">
                <div className="op-days-row">
                  <div>
                    <span className="op-days-num">{Math.round(data.monthPoints)}</span>
                    <span className="op-days-den"> / {data.pointsTarget} days</span>
                  </div>
                  {meter?.met ? (
                    <span className="op-badge goal">Goal met</span>
                  ) : (
                    <span className="op-days-togo">{meter?.side}</span>
                  )}
                </div>
                <div className="op-days-track" aria-hidden>
                  <div className="op-days-fill" style={{ width: `${pct}%` }} />
                </div>
                <p className="op-meta" style={{ marginTop: 10 }}>
                  {data.monthVisitDays === 1 ? "1 visit so far." : `${data.monthVisitDays} visits so far.`}
                </p>
                <div className="op-hours-fyi">
                  <div>
                    <span className="op-label">Hours today</span>{" "}
                    <span className="op-badge fyi">FYI</span>
                    <div className="op-meta" style={{ marginTop: 2 }}>
                      Suggested {data.dayHoursAdvisory} h a day. Does not affect days.
                    </div>
                  </div>
                  <div className="op-hours-value">{fmtHours(data.today.hoursToday)}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <p className="op-msg-err" style={{ margin: 0 }}>
                Could not load your month.
              </p>
            </div>
          )}
        </div>

        <div className="op-wcal" aria-label="Month calendar">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="op-wcal-h">
              {d}
            </div>
          ))}
          {loading && !data
            ? cells.map((c, i) =>
                c ? (
                  <span key={i} className="skeleton op-wcal-d" style={{ display: "block" }} />
                ) : (
                  <div key={i} className="op-wcal-d blank" />
                ),
              )
            : cells.map((c, i) => {
                if (!c) return <div key={i} className="op-wcal-d blank" />;
                const d = dayMap.get(c);
                const isToday = c === todayKey;
                const isSel = selected === c;
                const isPend = pendingDays.has(c);
                const cls = [
                  "op-wcal-d",
                  d ? "has-visit" : "",
                  isToday ? "today" : "",
                  isSel ? "sel" : "",
                  isPend ? "pend" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const sub = isPend && !d
                  ? "Pending review"
                  : d
                    ? isToday && data?.today.inOffice
                      ? "In now"
                      : calendarOfficeLabel(d.intervals, d.officeName)
                    : "";
                return (
                  <button
                    key={c}
                    type="button"
                    className={cls}
                    onClick={() => openDay(c)}
                    aria-label={`${c}${d ? `, ${chipLabel(d.points)}` : ""}${isPend ? ", pending review" : ""}`}
                  >
                    <span>{Number(c.slice(8))}</span>
                    <div className="op-wcal-body">
                      {d ? <span className="op-wcal-chip">{chipLabel(d.points)}</span> : null}
                      {sub ? <span className="op-wcal-of">{sub}</span> : null}
                    </div>
                  </button>
                );
              })}
        </div>
      </div>

      {selected ? (
        <>
          <div className="op-scrim" onClick={closeDrawer} aria-hidden />
          {correcting ? (
            <CorrectionDrawer
              dayKey={selected}
              day={sel}
              timezone={tz}
              offices={offices}
              monthPoints={data?.monthPoints ?? 0}
              pointsTarget={data?.pointsTarget ?? 8}
              onClose={closeDrawer}
              onCancel={() => setCorrecting(false)}
              onSaved={() => {
                setCorrecting(false);
                void load(month);
                void loadCorrections(month);
              }}
            />
          ) : (
            <DayDrawer
              dayKey={selected}
              day={sel}
              timezone={tz}
              pending={pendingDays.has(selected)}
              viewAsReadonly={viewAsReadonly}
              viewAsName={viewAs?.name}
              onClose={closeDrawer}
              onCorrect={() => {
                if (viewAsReadonly) return;
                setCorrecting(true);
              }}
            />
          )}
        </>
      ) : null}
    </>
  );
}

function DayDrawer({
  dayKey,
  day,
  timezone,
  pending,
  viewAsReadonly,
  viewAsName,
  onClose,
  onCorrect,
}: {
  dayKey: string;
  day?: Day;
  timezone: string;
  pending: boolean;
  viewAsReadonly?: boolean;
  viewAsName?: string;
  onClose: () => void;
  onCorrect: () => void;
}) {
  const visits = day?.intervals.length ?? 0;
  const groups = day ? groupOfficesFromIntervals(day.intervals) : [];
  const multi = groups.length >= 2;
  const travelMin = day ? travelMinutes(day.intervals, day.hours) : 0;
  const travelHours = travelMin / 60;
  return (
    <aside className="op-drawer" role="dialog" aria-label="Day detail">
      <div className="op-drawer-body">
        <div className="op-drawer-head">
          <span className="op-meta">Day detail</span>
          <button type="button" className="op-icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <h2 className="op-drawer-title">{dayTitle(dayKey, timezone)}</h2>
        {!day ? (
          <p className="op-ink2" style={{ margin: "4px 0 0" }}>
            {pending ? "Recorded: no visit" : "No visit"}
          </p>
        ) : null}
        {day ? (
          <div className="op-drawer-chip-row">
            <span className="op-badge accent" style={{ background: "var(--op-accent)", color: "var(--op-on-accent)" }}>
              {day.points === 1 ? "Counts as 1 day" : `Counts as ${Math.round(day.points)} days`}
            </span>
            <span className="op-meta">
              {multi
                ? `${groups.length} offices, ${visits} visit${visits === 1 ? "" : "s"}`
                : day.points > 1
                  ? `Each visit day at this office counts as ${Math.round(day.points)}`
                  : day.officeName || "Office"}
            </span>
          </div>
        ) : null}

        {day && multi ? (
          <div style={{ marginTop: 22 }}>
            <DayTimeline intervals={day.intervals} timezone={timezone} />
          </div>
        ) : null}

        {day && groups.length > 0 ? (
          <div className="op-office-groups" style={{ marginTop: 20 }}>
            {groups.map((g, gi) => (
              <div key={g.key} className="op-office-group" style={{ marginBottom: 14 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                  <span className="row" style={{ gap: 8, display: "inline-flex", alignItems: "center" }}>
                    <i className={`op-tl-swatch ${gi === 0 ? "a" : gi === 1 ? "b" : "c"}`} aria-hidden />
                    <strong style={{ color: gi === 0 ? "var(--op-ink)" : "var(--op-ink-2)" }}>{g.name}</strong>
                  </span>
                  <span className="op-ink2 tab">{fmtHours(g.hours)}</span>
                </div>
                {g.visits.map((iv, i) => (
                  <div key={i} className="op-visit-row">
                    <span className="tab">
                      {fmtTime(iv.startAt, timezone)} to {fmtTime(iv.endAt, timezone)}
                    </span>
                    <span className="tab">{fmtHours(iv.hours)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {day ? (
          <div className="op-drawer-hours">
            <span className="row" style={{ gap: 8, display: "inline-flex", alignItems: "center" }}>
              <span className="op-label">{multi ? "Total in office" : "Hours"}</span>
              <span className="op-badge fyi">FYI</span>
            </span>
            <span className="op-ink2 tab">{fmtHours(day.hours)}</span>
          </div>
        ) : null}

        {day ? (
          <p className="op-meta" style={{ marginTop: 12 }}>
            {multi
              ? `${fmtHours(travelHours)} between offices is not counted. The day counts once.`
              : visits === 1
                ? "One visit, one visit day."
                : `${visits} visits, one visit day.`}{" "}
            {!multi ? "A gap of 15 min or more starts a new visit." : null}
          </p>
        ) : (
          <p className="op-meta" style={{ marginTop: 16 }}>
            No visit recorded for this day.
          </p>
        )}
      </div>

      <div className="op-drawer-actions">
        {pending ? (
          <p className="op-badge accent">Pending review</p>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={viewAsReadonly}
              onClick={onCorrect}
            >
              Request a correction
            </button>
            {viewAsReadonly ? (
              <p className="op-meta" style={{ marginTop: 8 }}>
                Not available while viewing as {viewAsName ?? "this user"}.
              </p>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function CorrectionDrawer({
  dayKey,
  day,
  timezone,
  offices,
  monthPoints,
  pointsTarget,
  onClose,
  onCancel,
  onSaved,
}: {
  dayKey: string;
  day?: Day;
  timezone: string;
  offices: Office[];
  monthPoints: number;
  pointsTarget: number;
  onClose: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [issue, setIssue] = useState<(typeof ISSUES)[number]["id"]>("missing_visit");
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const [inTime, setInTime] = useState("09:30");
  const [outTime, setOutTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewAfter, setPreviewAfter] = useState<number | null>(null);

  useEffect(() => {
    if (!officeId && offices[0]) setOfficeId(offices[0].id);
  }, [offices, officeId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (issue === "should_not_count") {
        const sp = new URLSearchParams({ day: dayKey, remove: "1" });
        const res = await fetch(`/api/me/corrections/preview?${sp}`);
        if (!cancelled && res.ok) {
          const j = await res.json();
          setPreviewAfter(j.effect?.days_after ?? null);
        }
        return;
      }
      const offset = timezone === "Asia/Kolkata" ? "+05:30" : "Z";
      const inAt = new Date(`${dayKey}T${inTime}:00${offset}`).toISOString();
      const outAt = new Date(`${dayKey}T${outTime}:00${offset}`).toISOString();
      const sp = new URLSearchParams({
        day: dayKey,
        office_id: officeId,
        in_at: inAt,
        out_at: outAt,
      });
      const res = await fetch(`/api/me/corrections/preview?${sp}`);
      if (!cancelled && res.ok) {
        const j = await res.json();
        setPreviewAfter(j.effect?.days_after ?? null);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [dayKey, issue, officeId, inTime, outTime, timezone]);

  async function submit() {
    setBusy(true);
    setError("");
    const offset = timezone === "Asia/Kolkata" ? "+05:30" : "Z";
    const start = new Date(`${dayKey}T${inTime}:00${offset}`);
    let end = new Date(`${dayKey}T${outTime}:00${offset}`);
    if (end <= start) end = new Date(end.getTime() + 24 * 3600_000);
    const remove = issue === "should_not_count";
    const res = await fetch("/api/me/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day: dayKey,
        issue,
        reason,
        requested: remove
          ? { remove: true }
          : { office_id: officeId || null, in_at: start.toISOString(), out_at: end.toISOString() },
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Could not send request");
      return;
    }
    onSaved();
  }

  const after = previewAfter ?? monthPoints;
  const afterPct = Math.min(100, Math.round((Math.max(0, after) / Math.max(1, pointsTarget)) * 100));

  return (
    <aside className="op-drawer op-drawer-wide" role="dialog" aria-label="Request a correction">
      <div className="op-drawer-head">
        <span className="op-meta">Request a correction</span>
        <button type="button" className="op-icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 className="op-drawer-title">{dayTitle(dayKey, timezone)}</h2>
      <p className="op-ink2" style={{ margin: "2px 0 0" }}>
        Recorded: {day?.officeName ? day.officeName : "no visit"}
      </p>

      <div className="op-corr-label">What looks wrong?</div>
      <div className="op-issue-list">
        {ISSUES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`op-issue ${issue === item.id ? "on" : ""}`}
            onClick={() => setIssue(item.id)}
          >
            <span className="op-radio" aria-hidden />
            <span>
              <b>{item.title}</b>
              <span className="op-meta">{item.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {issue !== "should_not_count" ? (
        <>
          <div className="op-corr-label">What should it be?</div>
          <label className="op-field">
            <select className="op-input op-input-sm" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <div className="op-corr-times">
            <label className="op-field">
              <span className="op-field-lab">In</span>
              <input className="op-input op-input-sm tab" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </label>
            <label className="op-field">
              <span className="op-field-lab">Out</span>
              <input className="op-input op-input-sm tab" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </label>
          </div>
        </>
      ) : (
        <p className="op-meta" style={{ marginTop: 16 }}>
          If approved, this day will not count toward your month.
        </p>
      )}

      <textarea
        className="op-ta"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why should this change?"
        rows={3}
      />

      <div className="op-corr-effect">
        <span className="op-meta">If approved:</span>
        <div className="op-mini-meter">
          <div className="op-days-track" style={{ width: 64, height: 6, marginTop: 0 }}>
            <div className="op-days-fill" style={{ width: `${afterPct}%` }} />
          </div>
          <span className="op-mini-v">
            {Math.round(after)} / {pointsTarget}
          </span>
        </div>
      </div>

      {error ? (
        <div className="op-msg-err" style={{ marginTop: 12 }} role="alert">
          {error}
        </div>
      ) : null}

      <div className="op-corr-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !reason.trim()}
          onClick={() => void submit()}
        >
          {busy ? "Sending..." : "Send request"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </aside>
  );
}
