"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Visit = {
  id: string;
  startAt: string;
  endAt: string;
  source: string;
  reason: string | null;
};

export default function UserVisitsClient({
  userId,
  visits: initial,
}: {
  userId: string;
  visits: Visit[];
}) {
  const router = useRouter();
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error" | "">("");
  const [busy, setBusy] = useState(false);

  async function addVisit() {
    setBusy(true);
    setMessage("");
    setMessageKind("");
    const res = await fetch("/api/admin/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, startAt, endAt, reason }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setMessage("Visit added");
      setMessageKind("ok");
      setStartAt("");
      setEndAt("");
      setReason("");
      router.refresh();
    } else {
      setMessage(data.error ?? "Failed");
      setMessageKind("error");
    }
  }

  async function removeVisit(id: string) {
    const why = window.prompt("Reason for deleting this visit?");
    if (!why) return;
    setBusy(true);
    setMessage("");
    setMessageKind("");
    const res = await fetch("/api/admin/visits", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reason: why }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setMessage("Visit deleted");
      setMessageKind("ok");
      router.refresh();
    } else {
      setMessage(data.error ?? "Failed");
      setMessageKind("error");
    }
  }

  return (
    <>
      <div className="card">
        <h2>Add admin visit</h2>
        <div className="form-stack">
          <label>Start (ISO)</label>
          <input
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            placeholder="2026-10-27T04:00:00.000Z"
            disabled={busy}
          />
          <label>End (ISO)</label>
          <input
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            placeholder="2026-10-27T09:00:00.000Z"
            disabled={busy}
          />
          <label>Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={busy || !startAt.trim() || !endAt.trim()}
              onClick={addVisit}
            >
              {busy ? "Saving..." : "Add visit"}
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>Visits</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Source</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {initial.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No visits yet.
                  </td>
                </tr>
              ) : (
                initial.map((v) => (
                  <tr key={v.id}>
                    <td>{v.startAt}</td>
                    <td>{v.endAt || "-"}</td>
                    <td>
                      {v.source}
                      {v.source === "admin" ? " (Edited by admin)" : ""}
                    </td>
                    <td>{v.reason ?? "-"}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() => removeVisit(v.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {message ? <p className={`status-msg ${messageKind}`}>{message}</p> : null}
    </>
  );
}
