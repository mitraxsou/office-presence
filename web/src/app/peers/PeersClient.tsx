"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/components/usePoll";
import { fmtSince, initials } from "@/lib/format";

type Peer = {
  id: string;
  name: string;
  email: string;
  inOffice: boolean;
  sinceAt: string | null;
  officeName: string | null;
};

type Filter = "all" | "in" | "out";

export default function PeersClient() {
  const [data, setData] = useState<{ optedIn: boolean; peers: Peer[] } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [office, setOffice] = useState("all");

  usePoll(async () => {
    const res = await fetch("/api/peers/presence", { cache: "no-store" });
    if (res.status === 403) {
      setForbidden(true);
      setData(null);
      return;
    }
    if (res.ok) {
      setForbidden(false);
      setData(await res.json());
    }
  }, 180_000);

  const offices = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.peers ?? []) {
      if (p.officeName) set.add(p.officeName);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const rows = useMemo(() => {
    let list = data?.peers ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(needle) ||
          (p.email || "").toLowerCase().includes(needle),
      );
    }
    if (filter === "in") list = list.filter((p) => p.inOffice);
    if (filter === "out") list = list.filter((p) => !p.inOffice);
    if (office !== "all") list = list.filter((p) => p.officeName === office);
    return list;
  }, [data, q, filter, office]);

  if (forbidden) {
    return (
      <>
        <div className="op-whead">
          <h1 className="op-page-title">Colleagues</h1>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "48px 32px" }}>
          <div className="op-page-title" style={{ fontSize: 22 }}>
            Colleagues not available
          </div>
          <p className="op-ink2" style={{ margin: "8px auto 0", maxWidth: 420 }}>
            This list is only for admins.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="op-whead">
        <h1 className="op-page-title">Colleagues</h1>
        <span className="op-meta op-share-line">
          {data?.optedIn ? "You are sharing your status" : "You are not sharing your status"}{" "}
          <a className="btn btn-ghost" href="/settings" style={{ fontSize: 13.5 }}>
            Manage sharing
          </a>
        </span>
      </div>

      {!data ? (
        <div className="card">
          <span className="skeleton" style={{ height: 20, marginBottom: 10, display: "block" }} />
          <span className="skeleton" style={{ height: 20, marginBottom: 10, display: "block" }} />
          <span className="skeleton" style={{ height: 20, display: "block" }} />
        </div>
      ) : !data.optedIn ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 32px" }}>
          <div className="op-page-title" style={{ fontSize: 22 }}>
            Sharing is off
          </div>
          <p className="op-ink2" style={{ margin: "8px auto 0", maxWidth: 420 }}>
            Turn on sharing in Settings to see colleagues who also share. You only see people while you share too.
          </p>
          <a className="btn btn-primary btn-sm" href="/settings" style={{ marginTop: 20, display: "inline-flex" }}>
            Manage sharing
          </a>
        </div>
      ) : (
        <>
          <div className="op-filters">
            <label className="op-search">
              <span className="op-search-ic" aria-hidden>
                ⌕
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name"
                aria-label="Search name"
              />
            </label>
            <div className="op-seg" role="group" aria-label="Status filter">
              {(
                [
                  ["all", "All"],
                  ["in", "In"],
                  ["out", "Out"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? "on" : undefined}
                  onClick={() => setFilter(id)}
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
              <option value="all">All offices</option>
              {offices.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {rows.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 32px" }}>
              <div className="t-h" style={{ font: "var(--op-text-heading)" }}>
                No colleagues match
              </div>
              <p className="op-ink2" style={{ margin: "8px 0 0" }}>
                Try another search or filter. Only people who share appear here.
              </p>
            </div>
          ) : (
            <div className="op-tbl card" style={{ padding: 0, overflow: "hidden" }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Since</th>
                    <th>Office</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const label = p.name || p.email;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="op-name-cell">
                            <div className="op-avatar sm" aria-hidden>
                              {initials(p.name, p.email)}
                            </div>
                            <b>{label}</b>
                          </div>
                        </td>
                        <td>
                          <span className={`op-badge ${p.inOffice ? "in" : "out"}`}>
                            <span className="op-badge-dot" aria-hidden />
                            {p.inOffice ? "In" : "Out"}
                          </span>
                        </td>
                        <td className="op-ink2">{p.sinceAt ? fmtSince(p.sinceAt) : "-"}</td>
                        <td>{p.officeName ?? (p.inOffice ? "Office" : "-")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="op-meta" style={{ marginTop: 14 }}>
            Shows only what colleagues chose to share: In or Out, since when, and office name.
          </p>
        </>
      )}
    </>
  );
}
