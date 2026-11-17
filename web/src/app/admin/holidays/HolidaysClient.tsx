"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dayLabel } from "../exceptions/format";

type Office = { id: string; name: string };
type HolidayRow = { id: string; dayKey: string; name: string; officeLocationId: string | null; officeName: string | null };
type Group = { key: string; dayKey: string; name: string; ids: string[]; offices: string[]; allOffices: boolean };
type ImportResult = { dryRun: boolean; rows: number; created: number; problems: Array<{ line: number; error: string }> };

function isWeekend(dayKey: string): boolean {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

export default function HolidaysClient({ year: initialYear, pointsTarget }: { year: number; pointsTarget: number }) {
  const [year, setYear] = useState(initialYear);
  const [rows, setRows] = useState<HolidayRow[] | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [officeFilter, setOfficeFilter] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState<{ dayKey: string; name: string; scope: "all" | "selected"; officeIds: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await fetch(`/api/admin/holidays?year=${year}`, { cache: "no-store" });
    if (!res.ok) {
      setLoadError(true);
      setRows([]);
      return;
    }
    const j = (await res.json()) as { holidays: HolidayRow[]; offices: Office[] };
    setRows(j.holidays);
    setOffices(j.offices);
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const h of rows ?? []) {
      if (officeFilter && h.officeLocationId && h.officeLocationId !== officeFilter) continue;
      const key = `${h.dayKey}|${h.name}`;
      const g = map.get(key) ?? { key, dayKey: h.dayKey, name: h.name, ids: [], offices: [], allOffices: false };
      g.ids.push(h.id);
      if (h.officeLocationId) g.offices.push(h.officeName ?? "Office");
      else g.allOffices = true;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [rows, officeFilter]);

  async function save() {
    if (!adding) return;
    const res = await fetch("/api/admin/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayKey: adding.dayKey,
        name: adding.name,
        officeIds: adding.scope === "selected" ? adding.officeIds : [],
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not add the holiday" });
      return;
    }
    setAdding(null);
    setMsg({ kind: "ok", text: "Holiday added. It shows on calendars. Targets stay the same." });
    void load();
  }

  async function remove(g: Group) {
    if (!window.confirm(`Delete ${g.name} on ${dayLabel(g.dayKey)}?`)) return;
    const res = await fetch("/api/admin/holidays", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: g.ids }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not delete" });
    else {
      setMsg({ kind: "ok", text: "Holiday deleted" });
      void load();
    }
  }

  const addValid =
    adding != null &&
    /^\d{4}-\d{2}-\d{2}$/.test(adding.dayKey) &&
    adding.name.trim().length > 0 &&
    (adding.scope === "all" || adding.officeIds.length > 0);

  return (
    <>
      <div className="op-whead">
        <div>
          <h1>Holidays</h1>
          <p className="op-sub">Holidays are shown on calendars and reports. Targets stay {pointsTarget} points.</p>
        </div>
        <div className="row" style={{ gap: 10, display: "flex", alignItems: "center" }}>
          <div className="op-seg" role="group" aria-label="Year">
            <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              ‹
            </button>
            <button type="button" className="on">
              {year}
            </button>
            <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              ›
            </button>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImporting(true)}>
            Import CSV
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setAdding({ dayKey: "", name: "", scope: "all", officeIds: [] })}
          >
            Add holiday
          </button>
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

      <div className="op-filters">
        <select className="op-sel" value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} aria-label="Office">
          <option value="">All offices</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {rows === null ? (
        <div className="card">
          <span className="skeleton" style={{ height: 200, display: "block" }} />
        </div>
      ) : loadError ? (
        <div className="op-empty">
          <h2>Could not load</h2>
          <p>Holidays did not load. Try again.</p>
          <div style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="op-empty">
          <h2>No holidays in {year}</h2>
          <p>Add holidays before granting a whole-month HR exception, so those days are skipped.</p>
        </div>
      ) : (
        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Applies to</th>
                <th>Working day?</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key}>
                  <td>{dayLabel(g.dayKey)}</td>
                  <td>{g.name}</td>
                  <td>{g.allOffices ? "All offices" : g.offices.join(", ")}</td>
                  <td>{isWeekend(g.dayKey) ? <span className="op-ink2">Weekend, no effect</span> : "Weekday"}</td>
                  <td className="r">
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => void remove(g)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <>
          <button type="button" className="op-drawer-scrim" aria-label="Close drawer" onClick={() => setAdding(null)} />
          <aside className="op-drawer" role="dialog" aria-label="Add holiday">
            <div className="op-drawer-head">
              <span className="op-meta">Holidays</span>
              <button type="button" className="op-icon-btn" aria-label="Close" onClick={() => setAdding(null)}>
                ×
              </button>
            </div>
            <h2 className="op-drawer-title">Add holiday</h2>
            <label className="op-field" style={{ marginTop: 18 }}>
              <span className="op-field-lab">Date</span>
              <input
                className="op-input op-input-sm"
                type="date"
                value={adding.dayKey}
                onChange={(e) => setAdding({ ...adding, dayKey: e.target.value })}
              />
            </label>
            <label className="op-field" style={{ marginTop: 14 }}>
              <span className="op-field-lab">Name</span>
              <input
                className="op-input op-input-sm"
                value={adding.name}
                maxLength={120}
                onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              />
            </label>
            <div style={{ marginTop: 14 }}>
              <span className="op-field-lab" style={{ display: "block", marginBottom: 8 }}>
                Applies to
              </span>
              <div className="op-seg" role="group" aria-label="Applies to">
                <button
                  type="button"
                  className={adding.scope === "all" ? "on" : undefined}
                  onClick={() => setAdding({ ...adding, scope: "all" })}
                >
                  All offices
                </button>
                <button
                  type="button"
                  className={adding.scope === "selected" ? "on" : undefined}
                  onClick={() => setAdding({ ...adding, scope: "selected" })}
                >
                  Selected offices
                </button>
              </div>
            </div>
            {adding.scope === "selected" ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {offices.map((o) => (
                  <label key={o.id} className="op-chk">
                    <input
                      type="checkbox"
                      checked={adding.officeIds.includes(o.id)}
                      onChange={(e) =>
                        setAdding({
                          ...adding,
                          officeIds: e.target.checked
                            ? [...adding.officeIds, o.id]
                            : adding.officeIds.filter((id) => id !== o.id),
                        })
                      }
                    />
                    {o.name}
                  </label>
                ))}
              </div>
            ) : null}
            <p className="op-meta" style={{ marginTop: 14 }}>
              Shown on calendars for these offices. HR exception ranges skip it. Targets stay {pointsTarget} points.
            </p>
            <div className="op-drawer-foot" style={{ marginTop: "auto", paddingTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={!addValid} onClick={() => void save()}>
                Add holiday
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {importing ? (
        <ImportModal
          onClose={() => setImporting(false)}
          onImported={(text) => {
            setImporting(false);
            setMsg({ kind: "ok", text });
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, dryRun }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not read the file");
      return;
    }
    if (dryRun) setResult(j as ImportResult);
    else onImported(`Imported ${(j as ImportResult).created} holidays.`);
  }

  return (
    <>
      <button type="button" className="op-drawer-scrim" aria-label="Close dialog" onClick={onClose} />
      <div className="op-wmodal" role="dialog" style={{ width: 640 }}>
        <h2 className="op-modal-title">Import holidays</h2>
        <p className="op-meta">Columns: date (YYYY-MM-DD), name, office. Leave office empty for all offices.</p>
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ marginTop: 12 }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setCsv(await f.text());
            setResult(null);
          }}
        />
        {result ? (
          <div className="card" style={{ marginTop: 14 }}>
            <b>{result.rows} holidays ready</b>
            <span className="op-meta">{result.problems.length} problems</span>
            {result.problems.length ? (
              <div className="op-tbl" style={{ marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.problems.map((p) => (
                      <tr key={`${p.line}-${p.error}`}>
                        <td className="tab">{p.line}</td>
                        <td>{p.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="op-ferr" style={{ marginTop: 12 }}>
            <span aria-hidden>!</span>
            <span>{error}</span>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          {result && result.rows > 0 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run(false)}>
              Import {result.rows} rows
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !csv} onClick={() => void run(true)}>
              Check file
            </button>
          )}
        </div>
      </div>
    </>
  );
}
