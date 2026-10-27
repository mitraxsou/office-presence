"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateTime, fmtHours, fmtTime } from "@/lib/format";

type Row = { id: string; email: string; name: string | null; monthPoints: number; monthVisitDays: number; hoursToday: number; met: boolean; lastDeviceName: string | null };
type Compliance = {
  pointsTarget: number;
  metCount: number;
  totalUsers: number;
  pendingCorrections: number;
  pendingOffices: number;
  users: Row[];
  pagination: { page: number; pageSize: number; total: number };
};
type Correction = {
  id: string;
  dayKey: string;
  proposedStart: string;
  proposedEnd: string;
  reason: string;
  officeName: string | null;
  createdAt: string;
  status: string;
  reviewNote: string | null;
  user: { email: string; name: string | null };
};

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}><span className="skeleton" style={{ height: 16 }} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span className="help">Page {page} of {pages}</span>
      <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export default function AdminReportsClient() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Compliance | null>(null);
  const [cStatus, setCStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [cPage, setCPage] = useState(1);
  const [corr, setCorr] = useState<{ requests: Correction[]; pagination: { page: number; pageSize: number; total: number } } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadCompliance = useCallback(async () => {
    setData(null);
    const res = await fetch(`/api/admin/reports?page=${page}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [page]);
  const loadCorrections = useCallback(async () => {
    setCorr(null);
    const res = await fetch(`/api/admin/corrections?status=${cStatus}&page=${cPage}`, { cache: "no-store" });
    if (res.ok) setCorr(await res.json());
  }, [cStatus, cPage]);

  useEffect(() => { loadCompliance(); }, [loadCompliance]);
  useEffect(() => { loadCorrections(); }, [loadCorrections]);

  async function decide(c: Correction, decision: "approve" | "reject") {
    const reviewNote = window.prompt(decision === "approve" ? "Note (optional)" : "Why reject?") ?? "";
    if (decision === "reject" && !reviewNote) return;
    const res = await fetch("/api/admin/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, decision, reviewNote }),
    });
    setMsg(res.ok ? { kind: "ok", text: `Correction ${decision}d` } : { kind: "error", text: "Review failed" });
    loadCorrections();
    loadCompliance();
  }

  return (
    <>
      <div className="card card-brand">
        <span className="card-title">Admin</span>
        <h1>Reports</h1>
        {data ? (
          <div className="stat-grid">
            <div className="stat"><span className="stat-label">Met {data.pointsTarget} points</span><span className="stat-value">{data.metCount} / {data.totalUsers}</span></div>
            <div className="stat"><span className="stat-label">Corrections waiting</span><span className="stat-value">{data.pendingCorrections}</span></div>
            <div className="stat"><span className="stat-label">Office suggestions</span><span className="stat-value"><a href="/admin/offices">{data.pendingOffices}</a></span></div>
          </div>
        ) : (
          <span className="skeleton" style={{ height: 70, marginTop: 12 }} />
        )}
      </div>

      <div className="card">
        <h2>Points compliance (this month)</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Person</th><th>Points</th><th>Visit days</th><th>Hours today (FYI)</th><th>Last device</th></tr></thead>
            <tbody>
              {!data ? (
                <SkeletonRows cols={5} />
              ) : data.users.length === 0 ? (
                <tr><td colSpan={5} className="muted">No users yet.</td></tr>
              ) : (
                data.users.map((u) => (
                  <tr key={u.id}>
                    <td><a href={`/admin/users/${u.id}`}>{u.name ?? u.email}</a><div className="muted">{u.email}</div></td>
                    <td className={u.met ? "ok" : undefined}>{u.monthPoints} / {data.pointsTarget}</td>
                    <td>{u.monthVisitDays}</td>
                    <td>{fmtHours(u.hoursToday)}</td>
                    <td>{u.lastDeviceName ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data ? <Pager {...data.pagination} onPage={setPage} /> : null}
      </div>

      <div className="card">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Correction inbox</h2>
          <select value={cStatus} onChange={(e) => { setCStatus(e.target.value as typeof cStatus); setCPage(1); }} style={{ width: "auto", margin: 0 }} aria-label="Correction status">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Person</th><th>Day</th><th>Proposed</th><th>Office</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {!corr ? (
                <SkeletonRows cols={6} />
              ) : corr.requests.length === 0 ? (
                <tr><td colSpan={6} className="muted">Nothing here.</td></tr>
              ) : (
                corr.requests.map((c) => (
                  <tr key={c.id}>
                    <td>{c.user.name ?? c.user.email}<div className="muted">{fmtDateTime(c.createdAt)}</div></td>
                    <td>{c.dayKey}</td>
                    <td>{fmtTime(c.proposedStart)} - {fmtTime(c.proposedEnd)}</td>
                    <td>{c.officeName ?? "-"}</td>
                    <td>{c.reason}{c.reviewNote ? <div className="muted">Note: {c.reviewNote}</div> : null}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {c.status === "pending" ? (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => decide(c, "approve")}>Approve</button>{" "}
                          <button className="btn btn-danger btn-sm" onClick={() => decide(c, "reject")}>Reject</button>
                        </>
                      ) : (
                        <span className="badge">{c.status}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {corr ? <Pager {...corr.pagination} onPage={setCPage} /> : null}
      </div>
      {msg ? <p className={`status-msg ${msg.kind}`}>{msg.text}</p> : null}
    </>
  );
}
