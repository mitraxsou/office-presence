"use client";

import { useState } from "react";
import { usePoll } from "@/components/usePoll";
import { fmtHours, fmtSince } from "@/lib/format";
import type { RosterRow } from "@/lib/roster";

type Roster = { pointsTarget: number; dayHoursAdvisory: number; users: RosterRow[] };

export default function AdminClient({ initial }: { initial: Roster }) {
  const [data, setData] = useState(initial);
  const [updated, setUpdated] = useState<Date | null>(null);

  usePoll(async () => {
    const res = await fetch("/api/admin/status", { cache: "no-store" });
    if (!res.ok) return;
    setData(await res.json());
    setUpdated(new Date());
  }, 30_000);

  const inCount = data.users.filter((u) => u.inOffice).length;

  return (
    <div className="card">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>People ({inCount} in now)</h2>
        <span className="help">{updated ? `Updated ${updated.toLocaleTimeString()}` : ""}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Status</th>
              <th>Office</th>
              <th>Since</th>
              <th>Month points</th>
              <th>Hours today (FYI)</th>
              <th>Last device</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.users.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">No users yet. People appear after their first sign-in.</td>
              </tr>
            ) : (
              data.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name ?? u.email}
                    <div className="muted">{u.email}</div>
                  </td>
                  <td>
                    <span className={`badge ${u.inOffice ? "badge-in" : ""}`}>{u.inOffice ? "In" : "Out"}</span>
                  </td>
                  <td>{u.inOffice ? u.officeName ?? "-" : "-"}</td>
                  <td>{u.inOffice ? fmtSince(u.sinceAt) : "-"}</td>
                  <td className={u.monthPoints >= data.pointsTarget ? "ok" : undefined}>
                    {u.monthPoints} / {data.pointsTarget}
                  </td>
                  <td>{fmtHours(u.hoursToday)}</td>
                  <td>
                    {u.lastDeviceName ?? "-"}
                    <div className="muted">
                      {u.devicesOnline}/{u.devices} online
                    </div>
                  </td>
                  <td>
                    <a className="btn btn-secondary btn-sm" href={`/admin/users/${u.id}`}>Visits</a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
