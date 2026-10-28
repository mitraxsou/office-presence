"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePoll } from "@/components/usePoll";
import type { RosterRow, RosterStats } from "@/lib/roster";

type Roster = {
  pointsTarget: number;
  dayHoursAdvisory: number;
  users: RosterRow[];
  stats?: RosterStats;
};

type OfficeOpt = { id: string; name: string };
type StatusFilter = "all" | "in" | "out";
type StatKey = "inNow" | "out" | "belowTarget" | "goalMet" | null;

function fmtAgo(since: Date | null, loading: boolean, errored: boolean): string {
  if (loading && !since) return "Loading";
  if (errored) return "Not updated";
  if (!since) return "Live";
  const s = Math.max(0, Math.round((Date.now() - since.getTime()) / 1000));
  if (s < 5) return "Updated just now";
  if (s < 60) return `Updated ${s} s ago`;
  const m = Math.floor(s / 60);
  return m === 1 ? "Updated 1 m ago" : `Updated ${m} m ago`;
}

function fmtClock(iso: string | null | undefined, tz = "Asia/Kolkata"): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .toLowerCase();
}

function fmtSinceLabel(iso: string | null | undefined, tz = "Asia/Kolkata"): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const yday = new Date();
  yday.setDate(yday.getDate() - 1);
  const ydayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(yday);
  const t = fmtClock(iso, tz);
  if (dayKey === todayKey) return t;
  if (dayKey === ydayKey) return `Yesterday ${t}`;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .replace(",", "")
    .toLowerCase()
    .replace(/\b(am|pm)\b/, (m) => m);
}

function fmtHoursLabel(h: number): string {
  const mins = Math.round(h * 60);
  const hr = Math.floor(mins / 60);
  const m = mins % 60;
  if (hr === 0 && m === 0) return "0 h";
  return `${hr} h ${m} m`;
}

/** In since before today (local tz) - likely stuck live status. */
function isStaleIn(inOffice: boolean, sinceAt: string | null | undefined, tz = "Asia/Kolkata"): boolean {
  if (!inOffice || !sinceAt) return false;
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(sinceAt));
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  return dayKey < todayKey;
}

async function adminSetPresence(opts: {
  userId: string;
  inOffice: boolean;
  officeLocationId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "setPresence",
        userId: opts.userId,
        inOffice: opts.inOffice,
        officeLocationId: opts.officeLocationId || undefined,
        confirm: true,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error || `Request failed (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: "The server did not respond." };
  }
}

function MiniDays({ current, target }: { current: number; target: number }) {
  const met = current >= target;
  const pct = Math.min(100, Math.round((Math.max(0, current) / Math.max(1, target)) * 100));
  return (
    <div className="op-mini">
      <div className="op-mini-track" aria-hidden>
        <div className="op-mini-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="op-mini-label">
        {current} / {target}
      </span>
      {met ? <span className="op-badge goal">Met</span> : null}
    </div>
  );
}

function buildQuery(opts: {
  q: string;
  office: string;
  status: StatusFilter;
  belowTarget: boolean;
}): string {
  const sp = new URLSearchParams();
  if (opts.q.trim()) sp.set("q", opts.q.trim());
  if (opts.office) sp.set("office", opts.office);
  if (opts.status !== "all") sp.set("status", opts.status);
  if (opts.belowTarget) sp.set("belowTarget", "1");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default function AdminClient({
  initial,
  offices = [],
}: {
  initial: Roster;
  offices?: OfficeOpt[];
}) {
  const [data, setData] = useState(initial);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [office, setOffice] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [belowTarget, setBelowTarget] = useState(false);
  const [statFilter, setStatFilter] = useState<StatKey>(null);
  const [tick, setTick] = useState(0);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const query = useMemo(
    () =>
      buildQuery({
        q,
        office,
        status,
        belowTarget: belowTarget || statFilter === "belowTarget",
      }),
    [q, office, status, belowTarget, statFilter],
  );

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      try {
        const res = await fetch(`/api/admin/status${query}`, { cache: "no-store" });
        if (!res.ok) {
          setError(`The server did not respond (error ${res.status}). Data on this page may be out of date.`);
          return;
        }
        setData(await res.json());
        setUpdated(new Date());
        setError(null);
      } catch {
        setError("The server did not respond. Data on this page may be out of date.");
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void load();
  }, [load]);

  usePoll(() => load({ quiet: true }), 180_000);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const stats: RosterStats = data.stats ?? {
    inNow: data.users.filter((u) => u.inOffice).length,
    out: data.users.filter((u) => !u.inOffice).length,
    belowTarget: data.users.filter((u) => u.monthPoints < data.pointsTarget).length,
    goalMet: data.users.filter((u) => u.monthPoints >= data.pointsTarget).length,
  };

  const emptyUniverse =
    !loading &&
    !error &&
    stats.inNow === 0 &&
    stats.out === 0 &&
    stats.belowTarget === 0 &&
    stats.goalMet === 0 &&
    !q &&
    !office &&
    status === "all" &&
    !belowTarget &&
    !statFilter;

  function onStat(key: StatKey) {
    if (key === "inNow") {
      setStatFilter(statFilter === "inNow" ? null : "inNow");
      setStatus(statFilter === "inNow" ? "all" : "in");
      setBelowTarget(false);
    } else if (key === "out") {
      setStatFilter(statFilter === "out" ? null : "out");
      setStatus(statFilter === "out" ? "all" : "out");
      setBelowTarget(false);
    } else if (key === "belowTarget") {
      const on = statFilter !== "belowTarget";
      setStatFilter(on ? "belowTarget" : null);
      setBelowTarget(on);
      setStatus("all");
    } else if (key === "goalMet") {
      const on = statFilter !== "goalMet";
      setStatFilter(on ? "goalMet" : null);
      setBelowTarget(false);
      setStatus("all");
      // goal met: client filter after fetch without belowTarget
    }
  }

  const rows = useMemo(() => {
    if (statFilter === "goalMet") {
      return data.users.filter((u) => u.monthPoints >= data.pointsTarget);
    }
    return data.users;
  }, [data.users, data.pointsTarget, statFilter]);

  const showSkeleton = loading && !updated;
  const faded = Boolean(error);

  void tick;

  async function markAsOut(u: RosterRow) {
    const label = u.name ?? u.email;
    if (
      !window.confirm(
        `Mark ${label} as Out? This clears live In status for colleagues and the roster.`,
      )
    ) {
      return;
    }
    setBusyUserId(u.id);
    setActionMsg(null);
    const res = await adminSetPresence({ userId: u.id, inOffice: false });
    setBusyUserId(null);
    if (!res.ok) {
      setActionMsg(res.error || "Could not Mark as Out.");
      return;
    }
    setActionMsg(`Marked ${label} as Out.`);
    await load({ quiet: true });
  }

  return (
    <div>
      <div className="op-whead">
        <h1>Roster</h1>
        <span className="op-meta-row" aria-live="polite">
          {fmtAgo(updated, loading, Boolean(error))}
        </span>
      </div>

      {error ? (
        <div className="op-msg-err" role="alert">
          <span aria-hidden>!</span>
          <div className="grow">
            <b>The roster did not load</b>
            {error}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {actionMsg ? (
        <div className="op-toast" role="status" style={{ marginBottom: 12 }}>
          <div>{actionMsg}</div>
        </div>
      ) : null}

      {emptyUniverse ? (
        <>
          <div className="op-strip op-strip-inline">
            {(
              [
                ["inNow", stats.inNow, "In now", true],
                ["out", stats.out, "Out", false],
                ["belowTarget", stats.belowTarget, "Below target", null],
                ["goalMet", stats.goalMet, "Goal met", null],
              ] as const
            ).map(([key, n, label, inDot]) => (
              <button
                key={key}
                type="button"
                className={`op-stat${statFilter === key ? " on" : ""}`}
                onClick={() => onStat(key)}
              >
                <div className="n">{n}</div>
                <div className="l">
                  {inDot === true ? <span className="op-dot in" /> : null}
                  {inDot === false ? <span className="op-dot" /> : null}
                  {label}
                </div>
              </button>
            ))}
          </div>
          <div className="op-empty">
            <div className="op-empty-icon" aria-hidden>
              ···
            </div>
            <h2>No people yet</h2>
            <p>
              People appear here after they sign in on the Office Presence phone app. Visits count once an office
              exists for where they work.
            </p>
            <a className="btn btn-primary btn-sm" href="/admin/offices" style={{ marginTop: 22, display: "inline-flex" }}>
              Open offices
            </a>
          </div>
        </>
      ) : (
        <div style={faded ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
          <div className="op-strip op-strip-inline">
            {(
              [
                ["inNow", stats.inNow, "In now", true as boolean | null],
                ["out", stats.out, "Out", false],
                ["belowTarget", stats.belowTarget, "Below target", null],
                ["goalMet", stats.goalMet, "Goal met", null],
              ] as const
            ).map(([key, n, label, inDot]) => (
              <button
                key={key}
                type="button"
                className={`op-stat${statFilter === key ? " on" : ""}`}
                onClick={() => onStat(key)}
                disabled={showSkeleton}
              >
                <div className="n">
                  {showSkeleton ? <span className="op-sk" style={{ width: 48, height: 32 }} /> : n}
                </div>
                <div className="l">
                  {inDot === true ? <span className="op-dot in" /> : null}
                  {inDot === false ? <span className="op-dot" /> : null}
                  {label}
                </div>
              </button>
            ))}
          </div>

          <div className="op-filters op-filters-desktop">
            <label className="op-search">
              <span aria-hidden>⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search name or email"
              />
            </label>
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
            <div className="op-seg" role="group" aria-label="Status filter">
              {(["all", "in", "out"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={status === s && statFilter !== "belowTarget" && statFilter !== "goalMet" ? "on" : ""}
                  onClick={() => {
                    setStatus(s);
                    setStatFilter(s === "in" ? "inNow" : s === "out" ? "out" : null);
                    if (s !== "all") setBelowTarget(false);
                  }}
                >
                  {s === "all" ? "All" : s === "in" ? "In" : "Out"}
                </button>
              ))}
            </div>
            <label className="op-chk">
              <input
                type="checkbox"
                checked={belowTarget || statFilter === "belowTarget"}
                onChange={(e) => {
                  setBelowTarget(e.target.checked);
                  setStatFilter(e.target.checked ? "belowTarget" : null);
                  if (e.target.checked) setStatus("all");
                }}
              />
              Below target only
            </label>
            <span style={{ marginLeft: "auto" }}>
              <a className="btn btn-secondary btn-sm" href={`/api/admin/export?kind=roster${office ? `&office=${encodeURIComponent(office)}` : ""}`}>
                Export CSV
              </a>
            </span>
          </div>
          <div className="op-filters-mobile" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button" className="op-chip" onClick={() => setMobileFilters(true)}>
              Search
            </button>
            <button
              type="button"
              className={`op-chip ${(belowTarget || statFilter === "belowTarget") ? "on" : ""}`}
              onClick={() => {
                const next = !(belowTarget || statFilter === "belowTarget");
                setBelowTarget(next);
                setStatFilter(next ? "belowTarget" : null);
                if (next) setStatus("all");
              }}
            >
              Below target
            </button>
            <button type="button" className={`op-chip ${office ? "on" : ""}`} onClick={() => setMobileFilters(true)}>
              {office ? offices.find((o) => o.id === office)?.name ?? "Office" : "All offices"}
            </button>
            <button type="button" className="op-chip" onClick={() => setMobileFilters(true)}>
              Filters
            </button>
          </div>
          {mobileFilters ? (
            <div className="op-msheet" role="dialog" aria-label="Roster filters">
              <button type="button" className="op-msheet-scrim" aria-label="Close" onClick={() => setMobileFilters(false)} />
              <div className="op-msheet-panel">
                <div className="op-msheet-grab" />
                <div className="mtitle" style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Filters</div>
                <label className="field" style={{ display: "block", marginBottom: 12 }}>
                  <span className="op-meta">Search</span>
                  <input className="op-input op-input-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />
                </label>
                <label className="field" style={{ display: "block", marginBottom: 12 }}>
                  <span className="op-meta">Office</span>
                  <select className="op-input op-input-sm" value={office} onChange={(e) => setOffice(e.target.value)}>
                    <option value="">All offices</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </label>
                <div className="op-seg" role="group" aria-label="Status filter" style={{ marginBottom: 12 }}>
                  {(["all", "in", "out"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={status === s ? "on" : ""}
                      onClick={() => {
                        setStatus(s);
                        setStatFilter(s === "in" ? "inNow" : s === "out" ? "out" : null);
                      }}
                    >
                      {s === "all" ? "All" : s === "in" ? "In" : "Out"}
                    </button>
                  ))}
                </div>
                <label className="op-chk" style={{ marginBottom: 16 }}>
                  <input
                    type="checkbox"
                    checked={belowTarget || statFilter === "belowTarget"}
                    onChange={(e) => {
                      setBelowTarget(e.target.checked);
                      setStatFilter(e.target.checked ? "belowTarget" : null);
                    }}
                  />
                  Below target only
                </label>
                <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={() => setMobileFilters(false)}>
                  Apply filters
                </button>
              </div>
            </div>
          ) : null}

          <div className="op-tbl" aria-busy={showSkeleton}>
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Status, since</th>
                  <th>Office</th>
                  <th>Month points</th>
                  <th className="r">Hours today</th>
                  <th>Last device</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {showSkeleton
                  ? Array.from({ length: 7 }).map((_, i) => (
                      <tr key={i}>
                        <td>
                          <span className="op-sk" style={{ width: 140 }} />
                          <span className="op-sk" style={{ width: 180, marginTop: 8, height: 10 }} />
                        </td>
                        <td>
                          <span className="op-sk" style={{ width: 56, height: 24, borderRadius: 999 }} />
                        </td>
                        <td>
                          <span className="op-sk" style={{ width: 130 }} />
                        </td>
                        <td>
                          <span className="op-sk" style={{ width: 120, height: 8, borderRadius: 999 }} />
                        </td>
                        <td className="r">
                          <span className="op-sk" style={{ width: 50, marginLeft: "auto" }} />
                        </td>
                        <td>
                          <span className="op-sk" style={{ width: 80 }} />
                        </td>
                        <td className="r">
                          <span className="op-sk" style={{ width: 90, height: 30, borderRadius: 999, marginLeft: "auto" }} />
                        </td>
                      </tr>
                    ))
                  : rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="muted">
                          No people match these filters.
                        </td>
                      </tr>
                    ) : (
                      rows.map((u) => {
                        const stale = isStaleIn(u.inOffice, u.sinceAt);
                        return (
                        <tr key={u.id}>
                          <td data-label="Person">
                            <div className="person-name">{u.name ?? u.email}</div>
                            <div className="person-email">{u.email}</div>
                          </td>
                          <td data-label="Status">
                            <span className={`op-badge ${u.inOffice ? "in" : "out"}`}>
                              <span className={`op-dot ${u.inOffice ? "in" : ""}`} />
                              {u.inOffice ? "In" : "Out"}
                            </span>
                            <div className="person-email" style={{ marginTop: 4 }}>
                              {fmtSinceLabel(u.sinceAt)}
                              {stale ? (
                                <span className="muted" style={{ marginLeft: 6 }}>
                                  Stale In
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className={!u.officeName ? "muted" : undefined} data-label="Office">
                            {u.inOffice ? u.officeName ?? "Unknown" : u.officeName ?? "-"}
                          </td>
                          <td data-label="Month points">
                            <MiniDays current={u.monthPoints} target={data.pointsTarget} />
                          </td>
                          <td className="r muted" data-label="Hours today">
                            {fmtHoursLabel(u.hoursToday)}
                          </td>
                          <td className="muted" data-label="Phone">
                            {u.lastDeviceName ?? "-"}
                          </td>
                          <td className="r" data-label="">
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                              {u.inOffice ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={busyUserId === u.id}
                                  onClick={() => void markAsOut(u)}
                                >
                                  {busyUserId === u.id ? "Working..." : stale ? "Clear In status" : "Mark as Out"}
                                </button>
                              ) : null}
                              <a className="btn btn-secondary btn-sm" href={`/admin/people/${u.id}`}>
                                View visits
                              </a>
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
