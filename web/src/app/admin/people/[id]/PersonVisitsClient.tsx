"use client";

import { useEffect, useMemo, useState } from "react";
import { DaysMeter } from "@/components/op/DesignKit";
import TimeClock from "@/components/TimeClock";

export type PersonVisitRow = {
  id: string;
  dayKey: string;
  dayLabel: string;
  officeName: string | null;
  officeId?: string | null;
  inLabel: string;
  outLabel: string;
  inAt?: string;
  outAt?: string | null;
  durationLabel: string;
  countsAsLabel: string;
  deviceLabel: string;
  deviceSub?: string | null;
  tag: "pending" | "corrected" | "edited" | null;
  secondary?: boolean;
};

export type PersonOffice = { id: string; name: string; pointsPerVisitDay: number };

export type PersonVisitsProps = {
  userId: string;
  name: string;
  email: string;
  initials: string;
  officeName: string | null;
  deviceCount: number;
  inOffice: boolean;
  sinceLabel: string;
  monthPoints: number;
  pointsTarget: number;
  monthKey: string;
  monthLabel: string;
  visitCount: number;
  correctedCount: number;
  pendingCount: number;
  visits: PersonVisitRow[];
  offices: PersonOffice[];
  timezone: string;
  firstName: string;
  /** Admins cannot edit their own visits (SPEC 15 / frame 110). */
  isOwnRecord?: boolean;
};

type EditVisit = {
  key: string;
  office_id: string;
  inTime: string;
  outTime: string;
  wasOffice?: string | null;
};

type HistoryRow = {
  actor: string;
  at: string;
  day: string | null;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string | null;
};

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function labelMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toTimeInput(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function dayIso(dayKey: string, time: string, tzHint: string): string {
  // Local wall time as Asia/Kolkata offset when that is the app timezone.
  const offset = tzHint === "Asia/Kolkata" || tzHint === "Asia/Calcutta" ? "+05:30" : "Z";
  return `${dayKey}T${time}:00${offset}`;
}

export default function PersonVisitsClient(props: PersonVisitsProps) {
  const [month, setMonth] = useState(props.monthKey);
  const [monthPoints, setMonthPoints] = useState(props.monthPoints);
  const [rows, setRows] = useState(props.visits);
  const [toast, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"edit" | "add" | "history" | null>(null);
  const [editDay, setEditDay] = useState<string | null>(null);
  const [editVisits, setEditVisits] = useState<EditVisit[]>([]);
  const [counted, setCounted] = useState(true);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [addDay, setAddDay] = useState("");
  const [addOffice, setAddOffice] = useState(props.offices[0]?.id ?? "");
  const [addIn, setAddIn] = useState("09:30");
  const [addOut, setAddOut] = useState("18:00");
  const [inOffice, setInOffice] = useState(props.inOffice);
  const [sinceLabel, setSinceLabel] = useState(props.sinceLabel);
  const [debugOfficeId, setDebugOfficeId] = useState(props.offices[0]?.id ?? "");
  const [presenceBusy, setPresenceBusy] = useState(false);

  const monthName = labelMonth(month);
  const firstName = props.firstName || props.name.split(/\s+/)[0] || "them";
  const canEdit = !props.isOwnRecord;

  async function setPresence(nextIn: boolean) {
    if (nextIn && !debugOfficeId) {
      setToast("Pick an office before Set In for debug.");
      return;
    }
    const msg = nextIn
      ? `Set ${firstName} In for debug at the selected office? This is for testing live status.`
      : `Mark ${firstName} as Out? This clears live In for colleagues and the roster.`;
    if (!window.confirm(msg)) return;
    setPresenceBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setPresence",
          userId: props.userId,
          inOffice: nextIn,
          officeLocationId: nextIn ? debugOfficeId : undefined,
          confirm: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        officeName?: string | null;
        sinceAt?: string | null;
      };
      if (!res.ok) {
        setToast(json.error || "Could not update live status.");
        return;
      }
      setInOffice(nextIn);
      if (nextIn) {
        setSinceLabel("just now");
        setToast(`Set In for debug${json.officeName ? ` at ${json.officeName}` : ""}.`);
      } else {
        setSinceLabel("");
        setToast("Marked as Out. Colleagues and roster will show Out after refresh.");
      }
    } finally {
      setPresenceBusy(false);
    }
  }

  const visits = useMemo(
    () => rows.filter((v) => v.dayKey.startsWith(month)),
    [rows, month],
  );

  const dayGroups = useMemo(() => {
    const map = new Map<string, PersonVisitRow[]>();
    for (const v of visits) {
      const list = map.get(v.dayKey) ?? [];
      list.push(v);
      map.set(v.dayKey, list);
    }
    return [...map.entries()].map(([dayKey, list]) => ({
      dayKey,
      label: list[0]?.dayLabel ?? dayKey,
      tag: list.find((x) => x.tag)?.tag ?? null,
      countsAs: list.find((x) => !x.secondary)?.countsAsLabel ?? "",
      visits: list,
      officeLabel:
        new Set(list.map((x) => x.officeName).filter(Boolean)).size >= 2
          ? `${new Set(list.map((x) => x.officeName).filter(Boolean)).size} offices`
          : list[0]?.officeName ?? "-",
    }));
  }, [visits]);

  const summaryBits = [
    `${props.visitCount} visit${props.visitCount === 1 ? "" : "s"} in ${props.monthLabel.split(" ")[0]}`,
  ];
  if (props.correctedCount) summaryBits.push(`${props.correctedCount} corrected`);
  if (props.pendingCount) summaryBits.push(`${props.pendingCount} pending review`);

  function openEdit(dayKey: string) {
    const dayRows = rows.filter((v) => v.dayKey === dayKey);
    setEditDay(dayKey);
    setEditVisits(
      dayRows.map((v, i) => ({
        key: v.id || `n-${i}`,
        office_id: v.officeId || props.offices[0]?.id || "",
        inTime: toTimeInput(v.inAt, "09:30"),
        outTime: toTimeInput(v.outAt || undefined, "18:00"),
        wasOffice: null,
      })),
    );
    setCounted(true);
    setNotify(true);
    setReason("");
    setError(null);
    setDrawer("edit");
  }

  function openAdd() {
    setAddDay(`${month}-01`);
    setAddOffice(props.offices[0]?.id ?? "");
    setAddIn("09:30");
    setAddOut("18:00");
    setReason("");
    setNotify(true);
    setError(null);
    setDrawer("add");
  }

  async function openHistory() {
    setError(null);
    setDrawer("history");
    const res = await fetch(`/api/admin/people/${props.userId}/history?month=${encodeURIComponent(month)}`);
    if (res.ok) {
      const j = await res.json();
      setHistory(j.history ?? []);
    }
  }

  async function saveEdit() {
    if (!editDay || !reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/people/${props.userId}/days/${editDay}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visits: editVisits.map((v) => ({
            office_id: v.office_id || null,
            in_at: dayIso(editDay, v.inTime, props.timezone),
            out_at: dayIso(editDay, v.outTime, props.timezone),
          })),
          counted,
          reason: reason.trim(),
          notify,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Could not save.");
        return;
      }
      if (typeof j.monthPoints === "number") setMonthPoints(j.monthPoints);
      setToast(
        `Saved. ${editDay} was updated${j.pendingClosed ? ". Open request closed." : ""}${notify ? ` ${firstName} was notified.` : ""}`,
      );
      setDrawer(null);
      // Soft-refresh labels locally
      setRows((prev) =>
        prev.map((r) =>
          r.dayKey === editDay
            ? {
                ...r,
                tag: "edited",
                officeName:
                  props.offices.find((o) => o.id === editVisits[0]?.office_id)?.name ?? r.officeName,
              }
            : r,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveAdd() {
    if (!addDay || !reason.trim()) {
      setError("Day and reason are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/people/${props.userId}/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: addDay,
          office_id: addOffice || null,
          in_at: dayIso(addDay, addIn, props.timezone),
          out_at: dayIso(addDay, addOut, props.timezone),
          reason: reason.trim(),
          notify,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Could not add visit.");
        return;
      }
      if (typeof j.monthPoints === "number") setMonthPoints(j.monthPoints);
      const officeName = props.offices.find((o) => o.id === addOffice)?.name ?? null;
      setRows((prev) => [
        {
          id: `new-${Date.now()}`,
          dayKey: addDay,
          dayLabel: addDay.slice(8),
          officeName,
          officeId: addOffice,
          inLabel: addIn,
          outLabel: addOut,
          inAt: dayIso(addDay, addIn, props.timezone),
          outAt: dayIso(addDay, addOut, props.timezone),
          durationLabel: "-",
          countsAsLabel: "Edited",
          deviceLabel: "Added by admin",
          tag: "edited",
        },
        ...prev,
      ]);
      setToast(`Saved. Visit added on ${addDay}.${notify ? ` ${firstName} was notified.` : ""}`);
      setDrawer(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div>
      <div className="op-meta-row" style={{ marginBottom: 10 }}>
        <a href="/admin/roster" style={{ color: "inherit" }}>
          Roster
        </a>
        {" / "}
        {props.name}
      </div>

      {toast ? (
        <div className="op-toast" role="status">
          <div>{toast}</div>
        </div>
      ) : null}

      {props.isOwnRecord ? (
        <div className="op-msg-err" role="status" style={{ marginBottom: 16 }}>
          <span className="op-msg-err-icon" aria-hidden>
            i
          </span>
          <div className="grow">
            <b>You cannot edit your own visits.</b>
            Another admin can, or you can send a correction request from My month.
          </div>
          <a className="btn btn-secondary btn-sm" href="/month">
            Open My month
          </a>
        </div>
      ) : null}

      <div className="op-whead" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div className="op-avatar" style={{ width: 64, height: 64, fontSize: 22 }}>
            {props.initials}
          </div>
          <div>
            <h1 style={{ margin: 0 }}>{props.name}</h1>
            <div className="op-meta-row" style={{ marginTop: 4 }}>
              {[props.email, props.officeName, `${props.deviceCount} phone${props.deviceCount === 1 ? "" : "s"}`]
                .filter(Boolean)
                .join(", ")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`op-badge ${inOffice ? "in" : "out"}`}>
            <span className={`op-dot ${inOffice ? "in" : ""}`} />
            {inOffice ? "In" : "Out"}
          </span>
          {sinceLabel ? <span className="op-meta-row">since {sinceLabel}</span> : null}
          {inOffice ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={presenceBusy}
              onClick={() => void setPresence(false)}
            >
              {presenceBusy ? "Working..." : "Mark as Out"}
            </button>
          ) : null}
          {props.offices.length > 0 ? (
            <>
              <select
                value={debugOfficeId}
                onChange={(e) => setDebugOfficeId(e.target.value)}
                disabled={presenceBusy}
                aria-label="Office for Set In debug"
              >
                {props.offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={presenceBusy || !debugOfficeId}
                onClick={() => void setPresence(true)}
              >
                Set In for debug
              </button>
            </>
          ) : null}
          {canEdit ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openHistory()}>
                Change history
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
                Add visit
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="op-person-grid">
        <div className="card">
          <DaysMeter current={monthPoints} target={props.pointsTarget} />
          <p className="op-meta-row" style={{ marginTop: 12 }}>
            {summaryBits.join(". ")}.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--op-line)",
              flexWrap: "wrap",
            }}
          >
            <div className="op-seg" role="group" aria-label="Month">
              <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
                ‹
              </button>
              <span style={{ padding: "0 12px", font: "var(--op-text-label)", fontWeight: 600 }}>{monthName}</span>
              <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
                ›
              </button>
            </div>
            <a
              className="btn btn-secondary btn-sm"
              href={`/api/admin/export?kind=person&userId=${encodeURIComponent(props.userId)}&month=${encodeURIComponent(month)}`}
            >
              Export CSV
            </a>
          </div>
        </div>

        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Day and visits</th>
                <th>Office</th>
                <th>In</th>
                <th>Out</th>
                <th className="r">Time</th>
                <th className="r">Counts as</th>
                <th>Phone</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {dayGroups.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="muted" data-label="">
                    No visits in {monthName}.
                  </td>
                </tr>
              ) : (
                dayGroups.flatMap((g) => {
                  const head = (
                    <tr key={`${g.dayKey}-h`} className={editDay === g.dayKey ? "hl" : undefined}>
                      <td data-label="Day">
                        <div className="person-name" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {g.label}
                          {g.tag === "pending" ? <span className="op-badge pending">Pending review</span> : null}
                          {g.tag === "corrected" ? <span className="op-badge corrected">Corrected</span> : null}
                          {g.tag === "edited" ? <span className="op-badge fyi" style={{ color: "var(--op-ink)" }}>Edited by admin</span> : null}
                        </div>
                      </td>
                      <td data-label="Office">{g.officeLabel}</td>
                      <td data-label="In">{g.visits[0]?.inLabel ?? "-"}</td>
                      <td data-label="Out">{g.visits.length === 1 ? g.visits[0]?.outLabel ?? "-" : ""}</td>
                      <td className="r" data-label="Time">
                        {g.visits.length === 1 ? g.visits[0]?.durationLabel : ""}
                      </td>
                      <td className="r" data-label="Counts as">
                        <strong>{g.countsAs}</strong>
                      </td>
                      <td className="muted" data-label="Phone">
                        {g.visits.length === 1 ? g.visits[0]?.deviceLabel : ""}
                      </td>
                      {canEdit ? (
                        <td className="r" data-label="">
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => openEdit(g.dayKey)}>
                            Edit day
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                  const subs =
                    g.visits.length > 1
                      ? g.visits.map((v, i) => (
                          <tr key={v.id} className="muted">
                            <td data-label="Visit">Visit {i + 1}</td>
                            <td data-label="Office">{v.officeName ?? "-"}</td>
                            <td data-label="In">{v.inLabel}</td>
                            <td data-label="Out">{v.outLabel}</td>
                            <td className="r" data-label="Time">
                              {v.durationLabel}
                            </td>
                            <td data-label="" />
                            <td className="muted" data-label="Phone">
                              {v.deviceLabel}
                            </td>
                            {canEdit ? <td /> : null}
                          </tr>
                        ))
                      : [];
                  return [head, ...subs];
                })
              )}
            </tbody>
          </table>
          <p className="op-meta" style={{ margin: 0, padding: "12px 18px", borderTop: "1px solid var(--op-line)" }}>
            Admin edits apply right away, without approval. Every edit is kept in Change history.
          </p>
        </div>
      </div>

      {drawer ? (
        <>
          <div className="op-drawer-scrim" onClick={() => setDrawer(null)} aria-hidden />
          <aside className="op-drawer op-drawer-wide" role="dialog" aria-label={drawer === "edit" ? "Edit day" : drawer === "add" ? "Add visit" : "Change history"}>
            <div className="op-drawer-body">
              <div className="op-drawer-head">
                <span className="op-meta">
                  {drawer === "edit"
                    ? `Edit day, ${props.name}`
                    : drawer === "add"
                      ? `Add visit, ${props.name}`
                      : props.name}
                </span>
                <button type="button" className="op-icon-btn" aria-label="Close" onClick={() => setDrawer(null)}>
                  ×
                </button>
              </div>
              <h2 className="op-drawer-title">
                {drawer === "edit" && editDay
                  ? editDay
                  : drawer === "add"
                    ? "Add a visit"
                    : "Change history"}
              </h2>
              <p className="op-meta" style={{ marginTop: 4 }}>
                {drawer === "history"
                  ? `${monthName}, newest first`
                  : drawer === "add"
                    ? "For a day the phone missed. Applies right away."
                    : "Changes apply right away. No approval needed."}
              </p>

              {drawer === "edit" ? (
                <>
                  <div className="op-meta" style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1.5fr .8fr .8fr 34px", gap: 8, fontWeight: 600 }}>
                    <span>Office</span>
                    <span>In</span>
                    <span>Out</span>
                    <span />
                  </div>
                  {editVisits.map((v, i) => (
                    <div key={v.key}>
                      <div className="op-vedit">
                        <select
                          className="op-input op-input-sm"
                          value={v.office_id}
                          onChange={(e) =>
                            setEditVisits((list) =>
                              list.map((x, j) => (j === i ? { ...x, office_id: e.target.value } : x)),
                            )
                          }
                        >
                          {props.offices.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                        <TimeClock
                          label="In"
                          value={v.inTime}
                          onChange={(hm) =>
                            setEditVisits((list) => list.map((x, j) => (j === i ? { ...x, inTime: hm } : x)))
                          }
                        />
                        <TimeClock
                          label="Out"
                          value={v.outTime}
                          previous={v.inTime}
                          onChange={(hm) =>
                            setEditVisits((list) => list.map((x, j) => (j === i ? { ...x, outTime: hm } : x)))
                          }
                        />
                        <button
                          type="button"
                          className="x"
                          aria-label="Remove visit"
                          onClick={() => setEditVisits((list) => list.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="op-ghost"
                    style={{ marginTop: 14 }}
                    onClick={() =>
                      setEditVisits((list) => [
                        ...list,
                        {
                          key: `n-${Date.now()}`,
                          office_id: props.offices[0]?.id || "",
                          inTime: "09:30",
                          outTime: "18:00",
                        },
                      ])
                    }
                  >
                    Add a visit to this day
                  </button>
                  <div className="btw" style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--op-line)", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>Count this day</div>
                      <div className="op-meta">Turn off to keep the visits but not count the day.</div>
                    </div>
                    <button
                      type="button"
                      className={`op-switch ${counted ? "on" : ""}`}
                      aria-pressed={counted}
                      onClick={() => setCounted((c) => !c)}
                    >
                      <i />
                    </button>
                  </div>
                  <label className="field" style={{ display: "block", marginTop: 16 }}>
                    <span className="op-meta" style={{ display: "block", marginBottom: 6 }}>
                      Reason (required, kept in history)
                    </span>
                    <textarea
                      className="op-input"
                      style={{ minHeight: 76, width: "100%" }}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <div className="btw" style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Tell {firstName} about this change</span>
                    <button
                      type="button"
                      className={`op-switch ${notify ? "on" : ""}`}
                      aria-pressed={notify}
                      onClick={() => setNotify((n) => !n)}
                    >
                      <i />
                    </button>
                  </div>
                </>
              ) : null}

              {drawer === "add" ? (
                <>
                  <label className="field" style={{ display: "block", marginTop: 22 }}>
                    <span className="op-meta" style={{ display: "block", marginBottom: 6 }}>
                      Day
                    </span>
                    <input
                      className="op-input op-input-sm"
                      type="date"
                      value={addDay}
                      onChange={(e) => setAddDay(e.target.value)}
                    />
                  </label>
                  <label className="field" style={{ display: "block", marginTop: 14 }}>
                    <span className="op-meta" style={{ display: "block", marginBottom: 6 }}>
                      Office
                    </span>
                    <select
                      className="op-input op-input-sm"
                      value={addOffice}
                      onChange={(e) => setAddOffice(e.target.value)}
                    >
                      {props.offices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                    <label className="field">
                      <span className="op-meta" style={{ display: "block", marginBottom: 6 }}>
                        In
                      </span>
                      <TimeClock label="In" value={addIn} onChange={setAddIn} />
                    </label>
                    <label className="field">
                      <span className="op-meta" style={{ display: "block", marginBottom: 6 }}>
                        Out
                      </span>
                      <TimeClock label="Out" value={addOut} previous={addIn} onChange={setAddOut} />
                    </label>
                  </div>
                  <label className="field" style={{ display: "block", marginTop: 14 }}>
                    <span className="op-meta" style={{ display: "block", marginBottom: 6 }}>
                      Reason (required, kept in history)
                    </span>
                    <textarea
                      className="op-input"
                      style={{ minHeight: 76, width: "100%" }}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <div className="btw" style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Tell {firstName} about this change</span>
                    <button
                      type="button"
                      className={`op-switch ${notify ? "on" : ""}`}
                      aria-pressed={notify}
                      onClick={() => setNotify((n) => !n)}
                    >
                      <i />
                    </button>
                  </div>
                </>
              ) : null}

              {drawer === "history" ? (
                <div style={{ marginTop: 24 }}>
                  {history.length === 0 ? (
                    <p className="op-meta">No history in {monthName}.</p>
                  ) : (
                    history.map((h, i) => (
                      <div key={i} className="op-hist">
                        <b>
                          {h.actor} {h.action.replace(/\./g, " ")}
                          {h.day ? ` ${h.day}` : ""}
                        </b>
                        <div className="op-meta">{new Date(h.at).toLocaleString()}</div>
                        <div className="ba">
                          {h.reason ? (
                            <>
                              <span>Reason</span>
                              <span>{h.reason}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {error ? <p className="op-meta" style={{ marginTop: 12 }}>{error}</p> : null}
            </div>

            <div className="op-drawer-actions">
              {drawer === "edit" ? (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveEdit()}>
                    {busy ? "Saving..." : "Save changes"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDrawer(null)}>
                    Cancel
                  </button>
                </>
              ) : null}
              {drawer === "add" ? (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveAdd()}>
                    {busy ? "Saving..." : "Add visit"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDrawer(null)}>
                    Cancel
                  </button>
                </>
              ) : null}
              {drawer === "history" ? (
                <a
                  className="btn btn-secondary btn-sm"
                  href={`/api/admin/export?kind=person&userId=${encodeURIComponent(props.userId)}&month=${encodeURIComponent(month)}`}
                >
                  Export history CSV
                </a>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
