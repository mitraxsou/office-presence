"use client";

import { useState } from "react";
import { usePoll } from "@/components/usePoll";
import { fmtSince } from "@/lib/format";

type Peer = { id: string; name: string; email: string; inOffice: boolean; sinceAt: string | null; officeName: string | null };

export default function PeersClient() {
  const [data, setData] = useState<{ optedIn: boolean; peers: Peer[] } | null>(null);

  usePoll(async () => {
    const res = await fetch("/api/peers/presence", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, 60_000);

  return (
    <>
      <div className="card card-brand">
        <span className="card-title">Peers</span>
        <h1>Who is in</h1>
        <p className="lead" style={{ marginBottom: 0 }}>
          Colleagues who chose to share. Shows In or Out, since when, and office name. Never live GPS. Refreshes every minute.
        </p>
      </div>
      <div className="card">
        {!data ? (
          <>
            <span className="skeleton" style={{ height: 20, marginBottom: 10 }} />
            <span className="skeleton" style={{ height: 20, marginBottom: 10 }} />
            <span className="skeleton" style={{ height: 20 }} />
          </>
        ) : !data.optedIn ? (
          <p className="muted" style={{ margin: 0 }}>
            Peer presence is off. Turn on sharing in <a href="/settings">Settings</a> to see colleagues who also share.
          </p>
        ) : data.peers.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No colleagues are sharing yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Person</th><th>Status</th><th>Since</th><th>Office</th></tr></thead>
              <tbody>
                {data.peers.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}<div className="muted">{p.email}</div></td>
                    <td><span className={`badge ${p.inOffice ? "badge-in" : ""}`}>{p.inOffice ? "In" : "Out"}</span></td>
                    <td>{p.inOffice ? fmtSince(p.sinceAt) : "-"}</td>
                    <td>{p.officeName ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
