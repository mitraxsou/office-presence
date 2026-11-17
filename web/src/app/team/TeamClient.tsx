"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toCsv } from "@/lib/export-csv";

type Person = {
  id: string;
  name: string;
  email: string;
  teamName: string | null;
  inOffice: boolean;
  sinceAt: string | null;
  officeName: string | null;
  monthPoints: number;
  pointsTarget: number;
  goalMet: boolean;
  exceptionDays: number;
  onLeaveToday: string | null;
  daysLeft: number;
  pendingRequests: number;
};
type Status = {
  month: string;
  pointsTarget: number;
  stats: { people: number; inNow: number; goalMet: number; belowTarget: number };
  people: Person[];
};

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function since(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function TeamClient() {
  const [data, setData] = useState<Status | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [below, setBelow] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    const res = await fetch("/api/team/status", { cache: "no-store" });
    if (res.status === 403) {
      setState("empty");
      return;
    }
    if (!res.ok) {
      setState("error");
      return;
    }
    setData((await res.json()) as Status);
    setState("ok");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const teams = useMemo(
    () => [...new Set((data?.people ?? []).map((p) => p.teamName).filter((t): t is string => !!t))].sort(),
    [data],
  );
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => {
      if (needle && !p.name.toLowerCase().includes(needle) && !p.email.toLowerCase().includes(needle)) return false;
      if (team && p.teamName !== team) return false;
      if (below && p.goalMet) return false;
      return true;
    });
  }, [data, q, team, below]);

  function exportCsv() {
    if (!data) return;
    const csv = toCsv(
      ["Person", "Email", "Team", "Today", "Office", "Month points", "Target", "Goal met", "HR exception days", "Days left"],
      rows.map((p) => [
        p.name,
        p.email,
        p.teamName ?? "",
        p.inOffice ? "In" : "Out",
        p.officeName ?? "",
        String(Math.round(p.monthPoints)),
        String(p.pointsTarget),
        p.goalMet ? "Yes" : "No",
        String(p.exceptionDays),
        String(p.daysLeft),
      ]),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `team-${data.month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (state === "empty") {
    return (
      <div className="op-empty">
        <h2>My team</h2>
        <p>No one reports to you yet. Admins set managers in Users.</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="op-empty">
        <h2>Could not load</h2>
        <p>Your team did not load. Try again.</p>
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
          <h1>My team</h1>
          <p className="op-sub">
            {data ? `${monthLabel(data.month)}. Everyone is measured against ${data.pointsTarget} points.` : "Loading"}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!data} onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      {data ? (
        <div className="op-strip op-strip-inline">
          {(
            [
              [data.stats.people, "people"],
              [data.stats.inNow, "In now"],
              [data.stats.goalMet, "met"],
              [data.stats.belowTarget, "below"],
            ] as const
          ).map(([n, l]) => (
            <div key={l} className="op-stat" style={{ cursor: "default" }}>
              <div className="n">{n}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="op-filters">
        <label className="op-search">
          <span aria-hidden>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" />
        </label>
        {teams.length > 1 ? (
          <select className="op-sel" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
        <label className="op-chk">
          <input type="checkbox" checked={below} onChange={(e) => setBelow(e.target.checked)} />
          Below target only
        </label>
      </div>

      {state === "loading" || !data ? (
        <div className="card">
          <span className="skeleton" style={{ height: 200, display: "block" }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="op-empty">
          <h2>No one matches</h2>
          <p>Clear the filters to see everyone.</p>
        </div>
      ) : (
        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Today</th>
                <th>Month points</th>
                <th>Days left</th>
                <th>Pending</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a href={`/team/${p.id}`} className="person-name">
                      {p.name}
                    </a>
                    {p.teamName ? <div className="person-email">{p.teamName}</div> : null}
                  </td>
                  <td>
                    <span className={`op-dot${p.inOffice ? " in" : ""}`} aria-hidden />{" "}
                    {p.inOffice ? `In ${p.officeName ?? ""}` : "Out"}
                    {p.inOffice && p.sinceAt ? <span className="op-meta"> since {since(p.sinceAt)}</span> : null}
                    {p.onLeaveToday ? (
                      <div className="op-meta">{p.onLeaveToday === "other_duty" ? "Other duty" : "On leave"}</div>
                    ) : null}
                  </td>
                  <td>
                    <span className="tab">
                      {Math.round(p.monthPoints)} / {p.pointsTarget}
                    </span>{" "}
                    {p.goalMet ? <span className="op-badge goal">Met</span> : <span className="op-badge">Below</span>}
                    {p.exceptionDays > 0 ? (
                      <div className="op-meta">
                        Includes {p.exceptionDays} HR exception {p.exceptionDays === 1 ? "day" : "days"}
                      </div>
                    ) : null}
                  </td>
                  <td className="op-ink2">{p.goalMet ? "-" : `${p.daysLeft} working`}</td>
                  <td className="op-ink2">
                    {p.pendingRequests ? `${p.pendingRequests} ${p.pendingRequests === 1 ? "request" : "requests"}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
