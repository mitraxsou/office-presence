"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dayLabel, monthLabel, pointsLabel, rangeLabel } from "./format";

type Office = { id: string; name: string; pointsPerVisitDay: number };
type Person = { id: string; name: string; email: string; homeOffice: Office | null };

type ExceptionRow = {
  id: string;
  userId: string;
  personName: string;
  personEmail: string;
  kind: "days" | "month";
  startDay: string;
  endDay: string;
  officeLocationId: string;
  officeName: string;
  pointsPerDay: number;
  days: number;
  totalPoints: number;
  reason: string;
  reference: string | null;
  grantedBy: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
};

type Preview = {
  startDay: string;
  endDay: string;
  days: string[];
  skippedDays: number;
  officeLocationId: string;
  officeName: string;
  pointsPerDay: number;
  total: number;
  months: Array<{ monthKey: string; days: number; before: number; after: number; added: number; locked: boolean }>;
  lockedMonths: string[];
};

type Kind = "single" | "days" | "month";

function recentMonths(current: string, count: number): string[] {
  const [y0, m0] = current.split("-").map(Number);
  const out: string[] = [];
  for (let i = -1; i < count; i++) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ExceptionsClient({
  currentMonth,
  offices,
  pointsTarget,
  grantFor,
  selfId,
}: {
  currentMonth: string;
  offices: Office[];
  pointsTarget: number;
  grantFor: Person | null;
  selfId: string;
}) {
  const [rows, setRows] = useState<ExceptionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [office, setOffice] = useState("");
  const [status, setStatus] = useState<"active" | "revoked" | "all">("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(Boolean(grantFor));
  const [revoking, setRevoking] = useState<ExceptionRow | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const params = new URLSearchParams({ status });
    if (month) params.set("month", month);
    if (office) params.set("office", office);
    const res = await fetch(`/api/admin/exceptions?${params}`, { cache: "no-store" });
    if (!res.ok) {
      setLoadError("Could not load exceptions. Try again.");
      setRows([]);
      return;
    }
    const j = (await res.json()) as { exceptions: ExceptionRow[] };
    setRows(j.exceptions);
  }, [month, office, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => !needle || r.personName.toLowerCase().includes(needle) || r.personEmail.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const active = visible.filter((r) => !r.revokedAt);
  const stats = {
    active: active.length,
    days: active.reduce((s, r) => s + r.days, 0),
    points: active.reduce((s, r) => s + r.totalPoints, 0),
  };

  function exportCsv() {
    const header = ["person", "email", "kind", "startDay", "endDay", "workingDays", "office", "pointsPerDay", "points", "reason", "reference", "grantedBy", "revokedAt", "revokeReason"];
    const lines = [header.join(",")].concat(
      visible.map((r) =>
        [
          r.personName,
          r.personEmail,
          r.kind,
          r.startDay,
          r.endDay,
          r.days,
          r.officeName,
          r.pointsPerDay,
          r.revokedAt ? 0 : r.totalPoints,
          r.reason,
          r.reference,
          r.grantedBy,
          r.revokedAt,
          r.revokeReason,
        ]
          .map(csvCell)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hr-exceptions-${month || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="op-whead">
        <div>
          <h1>HR exceptions</h1>
          <p className="op-sub">
            Credit for days away on approved work or leave. Each working day counts as the home office points. Targets
            stay {pointsLabel(pointsTarget)}.
          </p>
        </div>
        <div className="row" style={{ gap: 10, display: "flex" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!visible.length}>
            Export CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setDrawerOpen(true)}>
            Grant exception
          </button>
        </div>
      </div>

      {msg ? (
        <div className={`op-toast ${msg.kind === "ok" ? "ok" : "err"}`} role="status">
          {msg.kind === "ok" ? <span aria-hidden>✓</span> : null}
          <div>{msg.text}</div>
          <button type="button" className="btn btn-ghost" onClick={() => setMsg(null)} aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="op-filters">
        <label className="op-search">
          <span className="op-search-ic" aria-hidden>
            ⌕
          </span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person" aria-label="Search person" />
        </label>
        <select className="op-sel" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          <option value="">All months</option>
          {recentMonths(currentMonth, 12).map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select className="op-sel" value={office} onChange={(e) => setOffice(e.target.value)} aria-label="Office">
          <option value="">All offices</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="op-sel"
          value={status}
          onChange={(e) => setStatus(e.target.value as "active" | "revoked" | "all")}
          aria-label="Status"
        >
          <option value="all">All, including revoked</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      <div className="op-strip op-strip-inline">
        <div className="op-stat" style={{ cursor: "default" }}>
          <div className="n">{stats.active}</div>
          <div className="l">active exceptions</div>
        </div>
        <div className="op-stat" style={{ cursor: "default" }}>
          <div className="n">{stats.days}</div>
          <div className="l">working days covered</div>
        </div>
        <div className="op-stat" style={{ cursor: "default" }}>
          <div className="n">{stats.points}</div>
          <div className="l">points added</div>
        </div>
      </div>

      {rows === null ? (
        <div className="card">
          <span className="skeleton" style={{ height: 200, display: "block" }} />
        </div>
      ) : loadError ? (
        <div className="op-empty">
          <h2>Could not load</h2>
          <p>{loadError}</p>
          <div style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="op-empty">
          <h2>No exceptions</h2>
          <p>No HR exceptions match these filters. Grant one to credit days away on approved work or leave.</p>
        </div>
      ) : (
        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Dates</th>
                <th className="r">Working days</th>
                <th>Home office</th>
                <th className="r">Points</th>
                <th>Reason</th>
                <th>Granted by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="person-name">{r.personName}</div>
                    <div className="person-email">{r.personEmail}</div>
                  </td>
                  <td>{rangeLabel(r.kind, r.startDay, r.endDay)}</td>
                  <td className="r tab">{r.days}</td>
                  <td>
                    {r.officeName}, {r.pointsPerDay}
                  </td>
                  <td className="r tab">{r.revokedAt ? <span className="op-ink2">0</span> : r.totalPoints}</td>
                  <td>
                    {r.revokedAt ? (
                      <>
                        <span className="op-badge out" title={r.revokeReason ?? undefined}>
                          Revoked {dayLabel(r.revokedAt.slice(0, 10)).slice(4)}
                        </span>{" "}
                      </>
                    ) : null}
                    {r.reason} {r.reference ? <span className="op-ink2">{r.reference}</span> : null}
                  </td>
                  <td>{r.grantedBy ?? "-"}</td>
                  <td className="r">
                    {!r.revokedAt && r.userId !== selfId ? (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setRevoking(r)}>
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerOpen ? (
        <GrantDrawer
          offices={offices}
          pointsTarget={pointsTarget}
          initialPerson={grantFor}
          selfId={selfId}
          onClose={() => setDrawerOpen(false)}
          onGranted={(text) => {
            setDrawerOpen(false);
            setMsg({ kind: "ok", text });
            void load();
          }}
        />
      ) : null}

      {revoking ? (
        <RevokeModal
          row={revoking}
          onClose={() => setRevoking(null)}
          onDone={(text, ok) => {
            setRevoking(null);
            setMsg({ kind: ok ? "ok" : "error", text });
            if (ok) void load();
          }}
        />
      ) : null}
    </>
  );
}

export function GrantDrawer({
  offices,
  pointsTarget,
  initialPerson,
  selfId,
  onClose,
  onGranted,
}: {
  offices: Office[];
  pointsTarget: number;
  initialPerson: Person | null;
  selfId: string;
  onClose: () => void;
  onGranted: (message: string) => void;
}) {
  const [person, setPerson] = useState<Person | null>(initialPerson);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [kind, setKind] = useState<Kind>("single");
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [month, setMonth] = useState("");
  const [officeId, setOfficeId] = useState(initialPerson?.homeOffice?.id ?? "");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmClosed, setConfirmClosed] = useState(false);
  const [closedReason, setClosedReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (person) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/exceptions/people?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { people: Person[] };
      setResults(j.people.filter((p) => p.id !== selfId));
    }, 250);
    return () => clearTimeout(t);
  }, [search, person, selfId]);

  const rangeReady = kind === "month" ? Boolean(month) : kind === "single" ? Boolean(startDay) : Boolean(startDay && endDay);

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!person || !rangeReady) return;
    const params = new URLSearchParams({ userId: person.id, kind: kind === "month" ? "month" : "days" });
    if (kind === "month") params.set("month", month);
    else {
      params.set("startDay", startDay);
      params.set("endDay", kind === "single" ? startDay : endDay);
    }
    if (officeId) params.set("office", officeId);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/exceptions/preview?${params}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setPreviewError(typeof j.error === "string" ? j.error : "Could not preview");
      else setPreview(j.preview as Preview);
    }, 250);
    return () => clearTimeout(t);
  }, [person, kind, startDay, endDay, month, officeId, rangeReady]);

  const needsOffice = person != null && !person.homeOffice && !officeId;
  const closed = (preview?.lockedMonths.length ?? 0) > 0;
  const canSubmit =
    !busy &&
    person != null &&
    preview != null &&
    preview.days.length > 0 &&
    reason.trim().length > 0 &&
    !needsOffice &&
    (!closed || (confirmClosed && closedReason.trim().length > 0));

  async function submit() {
    if (!canSubmit || !person || !preview) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: person.id,
        kind: kind === "month" ? "month" : "days",
        startDay: kind === "month" ? undefined : startDay,
        endDay: kind === "month" ? undefined : kind === "single" ? startDay : endDay,
        monthKey: kind === "month" ? month : undefined,
        officeLocationId: officeId || null,
        reason,
        reference: reference || null,
        confirmClosedMonth: closed ? confirmClosed : undefined,
        closedMonthReason: closed ? closedReason : undefined,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not grant the exception");
      return;
    }
    onGranted(
      `Exception granted. ${preview.days.length} working ${preview.days.length === 1 ? "day" : "days"} for ${person.name}. They get a notice.`,
    );
  }

  const officeChoice = officeId || person?.homeOffice?.id || "";

  return (
    <>
      <button type="button" className="op-drawer-scrim" aria-label="Close drawer" onClick={onClose} />
      <aside className="op-drawer" role="dialog" aria-label="Grant exception">
        <div className="op-drawer-head">
          <span className="op-meta">HR exceptions</span>
          <button type="button" className="op-icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <h2 className="op-drawer-title">Grant exception</h2>

        <div className="op-field" style={{ marginTop: 18 }}>
          <span className="op-field-lab">Person</span>
          {person ? (
            <div className="row" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span>
                <b>{person.name}</b>
                {person.homeOffice ? `, ${person.homeOffice.name}` : ""}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
                onClick={() => {
                  setPerson(null);
                  setOfficeId("");
                }}
              >
                Change person
              </button>
            </div>
          ) : (
            <>
              <input
                className="op-input op-input-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search person"
              />
              <div className="op-lst" style={{ marginTop: 6 }}>
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="op-lst-it"
                    onClick={() => {
                      setPerson(p);
                      setOfficeId(p.homeOffice?.id ?? "");
                    }}
                  >
                    <b>{p.name}</b> <span className="op-ink2">{p.homeOffice ? p.homeOffice.name : "No home office"}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <span className="op-field-lab" style={{ display: "block", marginBottom: 8 }}>
            Type
          </span>
          <div className="op-seg" role="group" aria-label="Type">
            {(
              [
                ["single", "Single day"],
                ["days", "Several days"],
                ["month", "Whole month"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={kind === id ? "on" : undefined} onClick={() => setKind(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {kind === "month" ? (
          <label className="op-field" style={{ marginTop: 14 }}>
            <span className="op-field-lab">Month</span>
            <input className="op-input op-input-sm" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: kind === "days" ? "1fr 1fr" : "1fr", gap: 10, marginTop: 14 }}>
            <label className="op-field">
              <span className="op-field-lab">{kind === "days" ? "From" : "Date"}</span>
              <input className="op-input op-input-sm" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
            </label>
            {kind === "days" ? (
              <label className="op-field">
                <span className="op-field-lab">To</span>
                <input className="op-input op-input-sm" type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} />
              </label>
            ) : null}
          </div>
        )}

        <label className="op-field" style={{ marginTop: 14 }}>
          <span className="op-field-lab">Office (defaults to home office)</span>
          <select className="op-input op-input-sm" value={officeChoice} onChange={(e) => setOfficeId(e.target.value)}>
            {!person?.homeOffice ? <option value="">Choose an office</option> : null}
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}, {pointsLabel(o.pointsPerVisitDay)} a day
              </option>
            ))}
          </select>
          {needsOffice ? <span className="op-meta">This person has no home office. Choose one.</span> : null}
        </label>

        {preview ? (
          <div className="card" style={{ marginTop: 14, gap: 4, display: "flex", flexDirection: "column" }}>
            <b>
              {preview.days.length} working {preview.days.length === 1 ? "day" : "days"}. {pointsLabel(preview.pointsPerDay)} a day.
            </b>
            {preview.months.map((m) => (
              <span key={m.monthKey} style={{ fontSize: 14 }}>
                Adds {pointsLabel(m.added)} to {monthLabel(m.monthKey).split(" ")[0]}. {person?.name.split(" ")[0]} goes from{" "}
                {m.before} to {m.after} of {pointsTarget} points.
              </span>
            ))}
            <span className="op-meta">Weekends and holidays are skipped.</span>
          </div>
        ) : previewError ? (
          <p className="op-meta" style={{ marginTop: 14 }}>
            {previewError}
          </p>
        ) : null}

        {closed ? (
          <div className="card" style={{ marginTop: 14 }}>
            <b>This month is closed.</b>
            <label className="op-chk" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={confirmClosed} onChange={(e) => setConfirmClosed(e.target.checked)} />
              Add it to a closed month anyway
            </label>
            <label className="op-field" style={{ marginTop: 8 }}>
              <span className="op-field-lab">Why a closed month (required)</span>
              <input className="op-input op-input-sm" value={closedReason} onChange={(e) => setClosedReason(e.target.value)} />
            </label>
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10, marginTop: 14 }}>
          <label className="op-field">
            <span className="op-field-lab">Reason (required)</span>
            <input className="op-input op-input-sm" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </label>
          <label className="op-field">
            <span className="op-field-lab">HR reference</span>
            <input className="op-input op-input-sm" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </label>
        </div>

        {error ? (
          <div className="op-ferr" style={{ marginTop: 12 }}>
            <span aria-hidden>!</span>
            <span>{error}</span>
          </div>
        ) : null}

        <div className="op-drawer-foot" style={{ marginTop: "auto", paddingTop: 18, display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Granting" : "Grant exception"}
          </button>
        </div>
      </aside>
    </>
  );
}

export function RevokeModal({
  row,
  onClose,
  onDone,
}: {
  row: { id: string; personName: string; days: number; totalPoints: number };
  onClose: () => void;
  onDone: (message: string, ok: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/exceptions/${row.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) onDone(typeof j.error === "string" ? j.error : "Could not revoke", false);
    else onDone(`Exception revoked. ${pointsLabel(row.totalPoints)} removed for ${row.personName}.`, true);
  }

  return (
    <>
      <button type="button" className="op-drawer-scrim" aria-label="Close dialog" onClick={onClose} />
      <div className="op-wmodal" role="dialog">
        <h2 className="op-modal-title">Revoke this exception?</h2>
        <p className="op-meta">
          {row.personName} loses up to {pointsLabel(row.totalPoints)} across {row.days} working{" "}
          {row.days === 1 ? "day" : "days"}. Days with a visit keep the visit points. The record stays.
        </p>
        <label className="op-field" style={{ marginTop: 14 }}>
          <span className="op-field-lab">Reason (required)</span>
          <input className="op-input op-input-sm" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!reason.trim() || busy} onClick={() => void submit()}>
            Revoke exception
          </button>
        </div>
      </div>
    </>
  );
}
