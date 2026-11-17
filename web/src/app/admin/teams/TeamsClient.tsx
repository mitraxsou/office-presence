"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Member = { id: string; email: string; name: string; managerName: string | null };
type Team = { id: string; name: string; lead: { id: string; email: string; name: string } | null; members: Member[] };
type Person = { id: string; email: string; name: string | null; teamId?: string | null };

export default function TeamsClient() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [noTeamCount, setNoTeamCount] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");

  const load = useCallback(async () => {
    setLoadError(false);
    const [t, u] = await Promise.all([
      fetch("/api/admin/teams", { cache: "no-store" }),
      fetch("/api/admin/users", { cache: "no-store" }),
    ]);
    if (!t.ok) {
      setLoadError(true);
      setTeams([]);
      return;
    }
    const tj = (await t.json()) as { teams: Team[]; noTeamCount: number };
    setTeams(tj.teams);
    setNoTeamCount(tj.noTeamCount);
    if (u.ok) setPeople(((await u.json()) as { users: Person[] }).users);
    setSelected((cur) => cur ?? tj.teams[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const team = useMemo(() => teams?.find((t) => t.id === selected) ?? null, [teams, selected]);
  const label = (p: Person) => `${p.name || p.email} (${p.email})`;

  async function call(url: string, method: string, body: unknown, ok: string) {
    setBusy(true);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not save" });
      return null;
    }
    setMsg({ kind: "ok", text: ok });
    await load();
    return j;
  }

  async function createTeam() {
    const name = window.prompt("Team name");
    if (!name?.trim()) return;
    const j = await call("/api/admin/teams", "POST", { name }, "Team created");
    if (j?.team?.id) setSelected(j.team.id);
  }

  async function rename(t: Team) {
    const name = window.prompt("Rename team", t.name);
    if (!name?.trim() || name === t.name) return;
    await call(`/api/admin/teams/${t.id}`, "PATCH", { name }, "Team renamed");
  }

  async function remove(t: Team) {
    const note = t.members.length ? ` Its ${t.members.length} members move to No team.` : "";
    if (!window.confirm(`Delete ${t.name}?${note}`)) return;
    await call(`/api/admin/teams/${t.id}`, "DELETE", null, "Team deleted");
    setSelected(null);
  }

  return (
    <>
      <div className="op-whead">
        <div>
          <h1>Teams</h1>
          <p className="op-sub">Teams group people for filters. A team lead sees members&apos; attendance, like a manager.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void createTeam()}>
          New team
        </button>
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

      {teams === null ? (
        <div className="card">
          <span className="skeleton" style={{ height: 200, display: "block" }} />
        </div>
      ) : loadError ? (
        <div className="op-empty">
          <h2>Could not load</h2>
          <p>Teams did not load. Try again.</p>
          <div style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
          <div className="card" style={{ padding: 8 }}>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`op-list-row${t.id === selected ? " on" : ""}`}
                style={{ display: "flex", width: "100%", justifyContent: "space-between", padding: "10px 12px" }}
                onClick={() => setSelected(t.id)}
              >
                <span>{t.name}</span>
                <span className="op-ink2 tab">{t.members.length}</span>
              </button>
            ))}
            <div className="op-ink2" style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px" }}>
              <span>No team</span>
              <span className="tab">{noTeamCount}</span>
            </div>
          </div>

          {team ? (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0 }}>{team.name}</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void rename(team)}>
                    Rename
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove(team)}>
                    Delete team
                  </button>
                </div>
              </div>

              <label className="op-field" style={{ marginTop: 16 }}>
                <span className="op-field-lab">Lead</span>
                <select
                  className="op-sel"
                  value={team.lead?.id ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    void call(`/api/admin/teams/${team.id}`, "PATCH", { leadUserId: e.target.value || null }, "Lead saved")
                  }
                >
                  <option value="">No lead</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                <b>Members ({team.members.length})</b>
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="op-sel" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Person to add">
                    <option value="">Choose a person</option>
                    {people
                      .filter((p) => p.teamId !== team.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {label(p)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || !adding}
                    onClick={() =>
                      void call(`/api/admin/users/${adding}`, "PATCH", { teamId: team.id }, "Added to team").then(() => setAdding(""))
                    }
                  >
                    Add people
                  </button>
                </div>
              </div>

              {team.members.length === 0 ? (
                <p className="op-meta" style={{ marginTop: 12 }}>
                  No members yet. Add people here, or import a CSV on Users.
                </p>
              ) : (
                <div className="op-tbl" style={{ marginTop: 12 }}>
                  <table>
                    <tbody>
                      {team.members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <b>{m.name}</b>
                            <div className="op-meta">{m.email}</div>
                          </td>
                          <td className="op-ink2">{m.managerName ? `Manager: ${m.managerName}` : "No manager"}</td>
                          <td className="r">
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: 13 }}
                              disabled={busy}
                              onClick={() => void call(`/api/admin/users/${m.id}`, "PATCH", { teamId: null }, "Removed from team")}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="op-empty">
              <h2>No teams yet</h2>
              <p>Create a team, then add people and choose a lead.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
