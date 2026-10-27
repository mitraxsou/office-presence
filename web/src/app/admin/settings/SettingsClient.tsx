"use client";

import { useState } from "react";

type Policy = {
  gapMinutes: number;
  dayHours: number;
  monthlyPointsTarget: number;
  timezone: string;
  fenceRadiusMeters: number;
  sampleIntervalMinutes?: number;
};

export default function SettingsClient({ policy: initial, activeOffices }: { policy: Policy; activeOffices: number }) {
  const [policy, setPolicy] = useState(initial);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error" | "">("");
  const [busy, setBusy] = useState(false);

  async function savePolicy() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/admin/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setPolicy({ ...data.policy, monthlyPointsTarget: data.policy.monthlyPointsTarget ?? 8 });
      setMessage("Rules saved");
      setMessageKind("ok");
    } else {
      setMessage(data.error ?? "Save failed");
      setMessageKind("error");
    }
  }

  async function resetAll() {
    if (!window.confirm("Reset all presence data? Accounts, offices, and audit history stay.")) return;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "RESET", reason: "admin settings reset" }),
    });
    const data = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Reset done: ${JSON.stringify(data.deleted)}` : data.error ?? "Reset failed");
    setMessageKind(res.ok ? "ok" : "error");
  }

  const num = (k: keyof Policy, step?: string) => (
    <input
      type="number"
      step={step}
      value={(policy[k] as number) ?? ""}
      onChange={(e) => setPolicy({ ...policy, [k]: Number(e.target.value) })}
      disabled={busy}
    />
  );

  return (
    <>
      <div className="card card-brand">
        <span className="card-title">Admin</span>
        <h1>Rules</h1>
        <p className="lead">Phones download these on sync. {activeOffices} active office{activeOffices === 1 ? "" : "s"}; manage them on <a href="/admin/offices">Offices</a>.</p>
        <div className="form-stack">
          <label>Monthly points target</label>
          {num("monthlyPointsTarget")}
          <p className="help" style={{ marginTop: "-0.5rem" }}>Target met when month points reach this number. Points per visit day are set per office.</p>
          <label>Advised hours per day (FYI only)</label>
          {num("dayHours", "0.5")}
          <p className="help" style={{ marginTop: "-0.5rem" }}>Shown as progress only. Never gates points and never marks a day failed.</p>
          <label>Gap minutes (ends a visit)</label>
          {num("gapMinutes")}
          <label>Timezone</label>
          <input value={policy.timezone} onChange={(e) => setPolicy({ ...policy, timezone: e.target.value })} disabled={busy} />
          <label>Minimum GPS accuracy (meters)</label>
          {num("fenceRadiusMeters")}
          <label>Sample interval (minutes)</label>
          {num("sampleIntervalMinutes")}
          <div className="btn-row">
            <button className="btn btn-primary" disabled={busy} onClick={savePolicy}>
              {busy ? "Saving..." : "Save rules"}
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>Multiple phones</h2>
        <p className="help" style={{ margin: 0 }}>
          A person can sign in on several phones. Evidence merges per person, the device name is logged on each event, and a
          visit day counts once no matter how many phones saw it. If one phone says In and another says Out for the same
          moment, the latest evidence timestamp wins.
        </p>
      </div>
      <div className="card">
        <h2>Reset presence data</h2>
        <p className="muted">Deletes events, visits, status, and alerts. Keeps accounts, offices, and audit history.</p>
        <div className="btn-row">
          <button className="btn btn-danger" disabled={busy} onClick={resetAll}>Reset presence data</button>
        </div>
      </div>
      {message ? <p className={`status-msg ${messageKind}`}>{message}</p> : null}
    </>
  );
}
