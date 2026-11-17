"use client";

import { useCallback, useEffect, useState } from "react";

type Req = {
  id: string;
  userId: string;
  name: string;
  dayKey: string;
  issue: string | null;
  officeName: string | null;
  proposedStart: string;
  proposedEnd: string;
  reason: string;
  createdAt: string;
};

function dayLabel(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function TeamCorrectionsClient() {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "off" | "error">("loading");
  const [open, setOpen] = useState<Req | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const res = await fetch("/api/team/corrections", { cache: "no-store" });
    if (res.status === 403) {
      setState("off");
      return;
    }
    if (!res.ok) {
      setState("error");
      return;
    }
    setRows(((await res.json()) as { requests: Req[] }).requests);
    setState("ok");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(decision: "approve" | "reject") {
    if (!open) return;
    setBusy(true);
    const res = await fetch("/api/team/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: open.id, decision, reviewNote: note }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not save the decision" });
      return;
    }
    setMsg({ kind: "ok", text: decision === "approve" ? "Approved" : "Marked not approved" });
    setOpen(null);
    setNote("");
    void load();
  }

  if (state === "off") {
    return (
      <div className="op-empty">
        <h2>Team corrections</h2>
        <p>Admins decide correction requests. Ask an admin if a request needs attention.</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="op-empty">
        <h2>Could not load</h2>
        <p>Requests did not load. Try again.</p>
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="op-whead">
        <div>
          <h1>Team corrections</h1>
          <p className="op-sub">Pending requests from your people. Your own requests go to an admin.</p>
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

      {state === "loading" || rows === null ? (
        <div className="card">
          <span className="skeleton" style={{ height: 160, display: "block" }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="op-empty">
          <h2>Nothing to review</h2>
          <p>New requests from your people show here.</p>
        </div>
      ) : (
        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Day</th>
                <th>Requested</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{dayLabel(r.dayKey)}</td>
                  <td>
                    {r.issue === "should_not_count"
                      ? "Remove this day"
                      : `${r.officeName ?? "Office"}, ${time(r.proposedStart)} to ${time(r.proposedEnd)}`}
                  </td>
                  <td className="op-ink2">{r.reason}</td>
                  <td className="r">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(r)}>
                      Review request
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <>
          <button type="button" className="op-drawer-scrim" aria-label="Close drawer" onClick={() => setOpen(null)} />
          <aside className="op-drawer" role="dialog" aria-label="Review request">
            <div className="op-drawer-head">
              <span className="op-meta">Team corrections</span>
              <button type="button" className="op-icon-btn" aria-label="Close" onClick={() => setOpen(null)}>
                ×
              </button>
            </div>
            <h2 className="op-drawer-title">
              {open.name}, {dayLabel(open.dayKey)}
            </h2>
            <div className="op-dkv">
              <span>Requested</span>
              <b>
                {open.issue === "should_not_count"
                  ? "Remove this day"
                  : `${open.officeName ?? "Office"}, ${time(open.proposedStart)} to ${time(open.proposedEnd)}`}
              </b>
            </div>
            <div className="op-dkv">
              <span>Reason</span>
              <b>{open.reason}</b>
            </div>
            <label className="op-field" style={{ marginTop: 16 }}>
              <span className="op-field-lab">Note</span>
              <textarea
                className="op-input op-input-sm"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Needed to mark it not approved"
              />
            </label>
            <div
              className="op-drawer-foot"
              style={{ marginTop: "auto", paddingTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !note.trim()}
                onClick={() => void decide("reject")}
              >
                Not approved
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide("approve")}>
                Approve
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
