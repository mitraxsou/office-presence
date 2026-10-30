"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { officeLabelForRequestedVisit } from "@/lib/correction-request";

type StatusTab = "pending" | "approved" | "auto_approved" | "reverted" | "rejected" | "all";

type RequestRow = {
  id: string;
  dayKey: string;
  issue: string | null;
  reason: string;
  status: string;
  pendingReason?: string | null;
  officeName: string | null;
  proposedStart: string;
  proposedEnd: string;
  recorded: unknown;
  requested: unknown;
  createdAt: string;
  userId: string;
  effect?: { days_before: number; days_after: number };
  phoneSync?: { device: string; lastBeforeIn: string | null; firstAfterOut: string | null }[];
  user: { id: string; email: string; name: string | null };
};

type Counts = {
  pending: number;
  approved: number;
  autoApproved?: number;
  reverted?: number;
  rejected: number;
  month: string;
  oldestPendingDays: number | null;
  correctionWindowDays: number;
};

type OfficeOpt = { id: string; name: string };

const ISSUE_LABEL: Record<string, string> = {
  missing_visit: "A visit is missing",
  wrong_times: "Times are wrong",
  wrong_office: "Wrong office",
  should_not_count: "This day should not count",
};

function monthName(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return "";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

function closeLabel(monthKey: string, windowDays: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return "";
  const close = new Date(Date.UTC(y, m, windowDays));
  const mon = monthName(monthKey);
  const d = close.getUTCDate();
  const closeMon = close.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${mon} requests close ${d} ${closeMon}`;
}

function fmtDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function fmtClock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  })
    .format(new Date(iso))
    .toLowerCase();
}

function fmtSent(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(y);
  const t = fmtClock(iso);
  if (day === today) return `Today ${t}`;
  if (day === yday) return "Yesterday";
  return d.toLocaleString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

function issueLabel(issue: string | null): string {
  if (!issue) return "Times are wrong";
  return ISSUE_LABEL[issue] ?? issue.replace(/_/g, " ");
}

function effectLabel(effect?: { days_before: number; days_after: number }): string {
  if (!effect) return "No change";
  const delta = effect.days_after - effect.days_before;
  if (delta === 0) return "No change";
  if (delta > 0) return `+${delta} point${delta === 1 ? "" : "s"}`;
  return `${delta} point${delta === -1 ? "" : "s"}`;
}

function recordedText(recorded: unknown): string {
  if (!recorded || typeof recorded !== "object") return "No visit";
  const r = recorded as Record<string, unknown>;
  if (r.visits == null || (Array.isArray(r.visits) && r.visits.length === 0) || r.no_visit) {
    return "No visit";
  }
  if (typeof r.summary === "string") return r.summary;
  if (r.in_at && r.out_at) return `${fmtClock(String(r.in_at))} to ${fmtClock(String(r.out_at))}`;
  return "Visit recorded";
}

function requestedText(
  requested: unknown,
  officeName: string | null,
  officesById: Map<string, string>,
): { lines: string[]; remove: boolean } {
  if (!requested || typeof requested !== "object") {
    return { lines: [officeName ?? "Requested change"], remove: false };
  }
  const r = requested as Record<string, unknown>;
  if (r.remove === true) return { lines: ["Remove this day"], remove: true };
  if (Array.isArray(r.visits)) {
    const lines = r.visits.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const v = item as Record<string, unknown>;
      const office = officeLabelForRequestedVisit(v, officesById, officeName);
      const inn = typeof v.in_at === "string" ? fmtClock(v.in_at) : "";
      const out = v.out_at == null || v.out_at === "" ? "Still In" : typeof v.out_at === "string" ? fmtClock(v.out_at) : "";
      return inn ? [`${office}, ${inn} to ${out}`] : [];
    });
    return { lines: lines.length ? lines : ["Requested change"], remove: false };
  }
  const lines: string[] = [];
  const office = officeLabelForRequestedVisit(r, officesById, officeName);
  if (office) lines.push(office);
  if (r.in_at && r.out_at) lines.push(`${fmtClock(String(r.in_at))} to ${fmtClock(String(r.out_at))}`);
  if (typeof r.counts_as === "number") {
    lines.push(r.counts_as === 1 ? "Counts as 1 point" : `Counts as ${r.counts_as} points`);
  }
  return { lines: lines.length ? lines : ["Requested change"], remove: false };
}

function syncLabel(row: { lastBeforeIn: string | null; firstAfterOut: string | null }): string {
  if (!row.lastBeforeIn && !row.firstAfterOut) return "No sync that day";
  const parts: string[] = [];
  if (row.lastBeforeIn) parts.push(`Last sync ${fmtClock(row.lastBeforeIn)}`);
  if (row.firstAfterOut) parts.push(`next ${fmtClock(row.firstAfterOut)}`);
  return parts.join(", ");
}

function initials(name: string | null, email: string): string {
  const n = (name || email).trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

export default function CorrectionsClient({ adminUserId }: { adminUserId: string }) {
  const [tab, setTab] = useState<StatusTab>("pending");
  const [office, setOffice] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [offices, setOffices] = useState<OfficeOpt[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    approved: 0,
    rejected: 0,
    month: "",
    oldestPendingDays: null,
    correctionWindowDays: 5,
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [mode, setMode] = useState<"review" | "reject" | "edit">("review");
  const [note, setNote] = useState("");
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editOfficeId, setEditOfficeId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canDecideOwn, setCanDecideOwn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    sp.set("status", tab);
    sp.set("pageSize", "50");
    if (office) sp.set("office", office);
    if (q.trim()) sp.set("q", q.trim());
    const res = await fetch(`/api/admin/corrections?${sp}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setRows(json.requests ?? []);
      setOffices(json.offices ?? []);
      if (json.counts) setCounts(json.counts);
      setCanDecideOwn(json.canDecideOwn === true);
    }
    setLoading(false);
  }, [tab, office, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const mon = monthName(counts.month);
  const closeText = counts.month ? closeLabel(counts.month, counts.correctionWindowDays) : "";
  const officesById = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);

  const ownSelected = selected != null && selected.userId === adminUserId;
  const blockOwnDecide = ownSelected && !canDecideOwn;

  function openReview(r: RequestRow) {
    setSelected(r);
    setMode("review");
    setNote("");
    setMsg(null);
    const req = (r.requested as Record<string, unknown> | null) ?? {};
    setEditIn(typeof req.in_at === "string" ? req.in_at.slice(0, 16) : r.proposedStart.slice(0, 16));
    setEditOut(typeof req.out_at === "string" ? req.out_at.slice(0, 16) : r.proposedEnd.slice(0, 16));
    setEditOfficeId(typeof req.office_id === "string" ? req.office_id : "");
  }

  async function decide(decision: "approve" | "reject" | "revert") {
    if (!selected) return;
    if ((decision === "reject" || decision === "revert") && !note.trim()) {
      setMsg("Note required");
      return;
    }
    setBusy(true);
    setMsg(null);
    let applied: unknown = undefined;
    if (decision === "approve" && mode === "edit") {
      applied = {
        office_id: editOfficeId || null,
        in_at: new Date(editIn).toISOString(),
        out_at: new Date(editOut).toISOString(),
      };
    }
    const res = await fetch("/api/admin/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        decision,
        reviewNote: note || null,
        ...(applied ? { applied } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? "Could not decide");
      return;
    }
    setSelected(null);
    setNote("");
    await load();
  }

  const emptyPending = !loading && tab === "pending" && rows.length === 0;

  const tiles = useMemo(
    () => [
      { key: "auto_approved" as const, n: String(counts.autoApproved ?? 0), l: mon ? `Auto approved in ${mon}` : "Auto approved" },
      { key: "pending" as const, n: String(counts.pending), l: "Need approval" },
      { key: "reverted" as const, n: String(counts.reverted ?? 0), l: "Reverted" },
      {
        key: "oldest" as const,
        n: counts.oldestPendingDays == null ? "None" : `${counts.oldestPendingDays} day${counts.oldestPendingDays === 1 ? "" : "s"}`,
        l: "Oldest pending",
      },
    ],
    [counts, mon],
  );

  return (
    <div>
      <div className="op-whead">
        <div>
          <h1>Corrections</h1>
          <p className="op-sub">Employee requests to change a day. Totals change only when you approve.</p>
        </div>
      </div>

      <div className="op-strip op-strip-inline">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`op-stat${tab === t.key ? " on" : ""}`}
            onClick={() => {
              if (t.key === "oldest") return;
              setTab(t.key);
              setSelected(null);
            }}
            disabled={t.key === "oldest"}
          >
            <div className="n">{t.n}</div>
            <div className="l">{t.l}</div>
          </button>
        ))}
      </div>

      <div className="op-filters">
        <div className="op-seg" role="tablist" aria-label="Correction status">
          {(
            [
              ["all", "All"],
              ["auto_approved", "Auto approved"],
              ["pending", "Need approval"],
              ["reverted", "Reverted"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              className={tab === k ? "on" : ""}
              onClick={() => {
                setTab(k);
                setSelected(null);
              }}
            >
              {label}
            </button>
          ))}
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
        <label className="op-search">
          <span aria-hidden>⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name"
            aria-label="Search name"
          />
        </label>
        {closeText ? <span style={{ marginLeft: "auto" }} className="op-meta-row">{closeText}</span> : null}
      </div>

      {emptyPending ? (
        <div className="op-empty">
          <div className="op-empty-icon" aria-hidden>
            ✓
          </div>
          <h2>No requests to review</h2>
          <p>New requests from employees appear here. Decided requests are under Approved and Not approved.</p>
        </div>
      ) : (
        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Day</th>
                <th>Issue</th>
                <th>Change</th>
                <th>Effect</th>
                <th>Sent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7}>
                      <span className="op-sk" style={{ width: "100%", height: 18 }} />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No requests in this view.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const req = requestedText(r.requested, r.officeName, officesById);
                  return (
                    <tr key={r.id} className={selected?.id === r.id ? "hl" : undefined}>
                      <td className="person-name">{r.user.name || r.user.email}</td>
                      <td>{fmtDay(r.dayKey)}</td>
                      <td>
                        {issueLabel(r.issue)}
                        {r.status === "pending" && r.pendingReason ? (
                          <div className="person-email">{r.pendingReason}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className="person-email">Recorded: {recordedText(r.recorded)}</div>
                        <div style={{ fontSize: 13.5 }}>Requested: {req.lines.join(", ")}</div>
                      </td>
                      <td className="person-name">{effectLabel(r.effect)}</td>
                      <td className="muted">{fmtSent(r.createdAt)}</td>
                      <td className="r">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openReview(r)}>
                          {r.status === "auto_approved" ? "View" : "Review"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <>
          <button type="button" className="op-drawer-scrim" aria-label="Close drawer" onClick={() => setSelected(null)} />
          <aside className="op-drawer" role="dialog" aria-label="Correction request">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="op-meta-row">Correction request</span>
              <button type="button" className="op-ghost" style={{ textDecoration: "none", fontSize: 22 }} onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
              <div className="op-avatar" style={{ width: 48, height: 48 }}>
                {initials(selected.user.name, selected.user.email)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "var(--op-text-heading)" }}>{selected.user.name || selected.user.email}</div>
                <div className="op-meta-row">
                  {[selected.officeName, `sent ${fmtSent(selected.createdAt).toLowerCase()}`].filter(Boolean).join(", ")}
                </div>
              </div>
              <span className="op-badge pending">Pending review</span>
            </div>

            <div style={{ font: "var(--op-text-title)", fontSize: 24, marginTop: 20 }}>
              {fmtDay(selected.dayKey)}: {issueLabel(selected.issue).toLowerCase()}
            </div>

            {mode === "reject" ? (
              <>
                <div className="op-cmp" style={{ marginTop: 16 }}>
                  <div>
                    <div className="h">Recorded</div>
                    <div className="muted">{recordedText(selected.recorded)}</div>
                  </div>
                  <div className="req">
                    <div className="h">Requested</div>
                    {requestedText(selected.requested, selected.officeName, officesById).lines.map((l) => (
                      <div key={l} className="person-name" style={{ fontSize: 15 }}>
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
                <label className="field" style={{ marginTop: 20, display: "block" }}>
                  <span className="lab">Note to {(selected.user.name || selected.user.email).split(" ")[0]} (required)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={5}
                    style={{
                      width: "100%",
                      marginTop: 6,
                      borderRadius: 12,
                      border: "1px solid var(--op-line)",
                      padding: 12,
                      font: "var(--op-text-body)",
                      background: "var(--op-surface)",
                      color: "var(--op-ink)",
                    }}
                  />
                </label>
                <p className="op-meta-row" style={{ marginTop: 10 }}>
                  {(selected.user.name || "They").split(" ")[0]} sees this note. The day stays as recorded, and they can send a
                  new request until the window closes.
                </p>
              </>
            ) : (
              <>
                <div className="op-cmp" style={{ marginTop: 16 }}>
                  <div>
                    <div className="h">Recorded</div>
                    <div className="muted">{recordedText(selected.recorded)}</div>
                  </div>
                  <div className="req">
                    <div className="h">Requested</div>
                    {mode === "edit" ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <select value={editOfficeId} onChange={(e) => setEditOfficeId(e.target.value)}>
                          <option value="">Office</option>
                          {offices.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                        <input type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
                        <input type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
                      </div>
                    ) : (
                      requestedText(selected.requested, selected.officeName, officesById).lines.map((l) => (
                        <div key={l} className="person-name" style={{ fontSize: 15 }}>
                          {l}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="op-meta-row" style={{ margin: "18px 0 6px", fontWeight: 600, color: "var(--op-ink)" }}>
                  Reason
                </div>
                <div className="op-quote">{selected.reason}</div>

                <div className="op-meta-row" style={{ margin: "18px 0 4px", fontWeight: 600, color: "var(--op-ink)" }}>
                  Phone data that day
                </div>
                <div>
                  {(selected.phoneSync ?? []).length === 0 ? (
                    <div className="muted" style={{ padding: "10px 0", fontSize: 14 }}>
                      No phone sync that day
                    </div>
                  ) : (
                    (selected.phoneSync ?? []).map((p) => (
                      <div
                        key={p.device}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 0",
                          borderBottom: "1px solid var(--op-line)",
                          fontSize: 14,
                        }}
                      >
                        <span>{p.device}</span>
                        <span className="muted">{syncLabel(p)}</span>
                      </div>
                    ))
                  )}
                </div>

                {selected.effect ? (
                  <>
                    <div className="op-meta-row" style={{ margin: "18px 0 8px", fontWeight: 600, color: "var(--op-ink)" }}>
                      Effect on {mon || "month"}
                    </div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <MiniBar n={selected.effect.days_before} />
                      <span className="muted">to</span>
                      <MiniBar n={selected.effect.days_after} />
                    </div>
                  </>
                ) : null}

                {!blockOwnDecide && selected.status === "pending" ? (
                  <button type="button" className="op-ghost" style={{ marginTop: 16, alignSelf: "flex-start" }} onClick={() => setMode(mode === "edit" ? "review" : "edit")}>
                    {mode === "edit" ? "Cancel edit" : "Edit before approving"}
                  </button>
                ) : null}
              </>
            )}

            <div style={{ marginTop: "auto", paddingTop: 18, borderTop: "1px solid var(--op-line)" }}>
              {blockOwnDecide ? (
                <p className="op-meta-row" style={{ margin: 0 }}>
                  You cannot decide your own requests.
                </p>
              ) : mode === "reject" ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || !note.trim()}
                    onClick={() => void decide("reject")}
                  >
                    Reject request
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode("review")}>
                    Back
                  </button>
                </div>
              ) : selected.status === "auto_approved" && !blockOwnDecide ? (
                <div>
                  <p className="op-meta" style={{ marginTop: 0 }}>Nothing to do unless something looks wrong.</p>
                  {selected.pendingReason ? <p className="op-meta">{selected.pendingReason}</p> : null}
                  <textarea className="op-ta" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the person (required)" rows={3} />
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy || !note.trim()} onClick={() => void decide("revert")}>
                    Revert correction
                  </button>
                </div>
              ) : selected.status === "pending" ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void decide("approve")}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setMode("reject")}>
                    Reject
                  </button>
                  {ownSelected && canDecideOwn ? (
                    <span className="op-meta-row" style={{ marginLeft: "auto" }}>
                      Sole admin: you may decide your own request.
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="op-badge">
                  {selected.status === "auto_approved"
                    ? "Auto approved"
                    : selected.status === "reverted"
                      ? "Reverted"
                      : selected.status === "approved"
                        ? "Approved"
                        : "Not approved"}
                </span>
              )}
              {msg ? <p className="status-msg error">{msg}</p> : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function MiniBar({ n }: { n: number }) {
  const target = 8;
  const pct = Math.min(100, Math.round((Math.max(0, n) / target) * 100));
  return (
    <div className="op-mini" style={{ minWidth: 100 }}>
      <div className="op-mini-track" aria-hidden>
        <div className="op-mini-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="op-mini-label">
        {n} / {target}
      </span>
    </div>
  );
}
