"use client";

import { useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";

type Prefs = {
  notifyOfficeDetected: boolean;
  notifyGoalMet: boolean;
  notifyDailySummary: boolean;
  notificationToneId: string;
  launchSoundEnabled: boolean;
  launchSoundId: string;
};
type Office = { id: string; name: string; adminName: string; alias: string | null; pointsPerVisitDay: number; addressLabel: string | null };
type Device = { id: string; label: string | null; platform: string; lastSeenAt: string | null; createdAt: string };

export const PEER_CONSENT_TEXT =
  "Share my presence with colleagues who also opted in. Shared: In or Out, since when, and the office name. Not shared: live GPS, coordinates, hours, or points. You can turn this off at any time.";

export default function UserSettingsClient({
  initial,
  policy,
}: {
  initial: { developerMode: boolean; sharePresenceWithPeers: boolean; timezone: string };
  policy: { monthlyPointsTarget: number; dayHours: number; gapMinutes: number; timezone: string; fenceRadiusMeters: number };
}) {
  const [theme, setTheme] = useState("system");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [share, setShare] = useState(initial.sharePresenceWithPeers);
  const [dev, setDev] = useState(initial.developerMode);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setTheme(localStorage.getItem("op-theme") ?? "system");
    fetch("/api/me/notification-prefs").then((r) => r.json()).then((j) => setPrefs(j.prefs));
    fetch("/api/offices").then((r) => r.json()).then((j) => setOffices(j.offices ?? []));
    loadDevices();
  }, []);

  function loadDevices() {
    fetch("/api/me/devices").then((r) => r.json()).then((j) => setDevices(j.devices ?? []));
  }

  function applyTheme(t: string) {
    setTheme(t);
    if (t === "system") {
      localStorage.removeItem("op-theme");
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem("op-theme", t);
      document.documentElement.dataset.theme = t;
    }
  }

  async function patchPrefs(patch: Partial<Prefs>) {
    if (!prefs) return;
    setPrefs({ ...prefs, ...patch });
    const res = await fetch("/api/me/notification-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setPrefs((await res.json()).prefs);
    else setMsg({ kind: "error", text: "Could not save notification settings" });
  }

  async function saveAlias(officeLocationId: string, displayName: string) {
    const res = await fetch("/api/me/aliases", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officeLocationId, displayName }),
    });
    setMsg(res.ok ? { kind: "ok", text: displayName ? "Alias saved" : "Alias cleared" } : { kind: "error", text: "Could not save alias" });
    fetch("/api/offices").then((r) => r.json()).then((j) => setOffices(j.offices ?? []));
  }

  async function revoke(id: string) {
    if (!window.confirm("Sign this device out? It stops sending presence until you sign in again.")) return;
    const res = await fetch(`/api/me/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setMsg(res.ok ? { kind: "ok", text: "Device signed out" } : { kind: "error", text: "Could not sign out device" });
    loadDevices();
  }

  async function rename(id: string, current: string | null) {
    const label = window.prompt("Device name", current ?? "");
    if (!label) return;
    await fetch("/api/me/devices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, label }) });
    loadDevices();
  }

  async function toggleShare(next: boolean) {
    if (next && !window.confirm(`${PEER_CONSENT_TEXT}\n\nTurn on sharing?`)) return;
    const res = await fetch("/api/me/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharePresenceWithPeers: next, consent: next }),
    });
    if (res.ok) {
      setShare((await res.json()).sharePresenceWithPeers);
      setMsg({ kind: "ok", text: next ? "Sharing on" : "Sharing off" });
    } else setMsg({ kind: "error", text: "Could not update sharing" });
  }

  async function toggleDev(next: boolean) {
    if (next && !window.confirm("Turn on developer mode? It shows test tools such as the 15 second gap and office suggestions. Simulated events never count toward points.")) return;
    const res = await fetch("/api/me/developer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ developerMode: next, confirm: next }),
    });
    if (res.ok) setDev((await res.json()).developerMode);
  }

  return (
    <>
      <div className="card card-brand">
        <span className="card-title">Settings</span>
        <h1>Your settings</h1>
        <p className="lead" style={{ marginBottom: 0 }}>Theme, notifications, office names, devices, and sharing.</p>
      </div>

      <div className="card">
        <h2>Theme</h2>
        <select value={theme} onChange={(e) => applyTheme(e.target.value)} aria-label="Theme">
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div className="card">
        <h2>Notifications</h2>
        {!prefs ? (
          <span className="skeleton" style={{ height: 120 }} />
        ) : (
          <>
            <Toggle label="Office detected" hint="When a phone sees you enter an office" checked={prefs.notifyOfficeDetected} onChange={(v) => patchPrefs({ notifyOfficeDetected: v })} />
            <Toggle label="Points goal met" hint="Once a month when you reach the target" checked={prefs.notifyGoalMet} onChange={(v) => patchPrefs({ notifyGoalMet: v })} />
            <Toggle label="Daily summary" hint="Morning points so far and remaining. Skipped once the goal is met." checked={prefs.notifyDailySummary} onChange={(v) => patchPrefs({ notifyDailySummary: v })} />
            <Toggle label="Launch sound on phone" hint="Short tone on cold start. Respects Do Not Disturb." checked={prefs.launchSoundEnabled} onChange={(v) => patchPrefs({ launchSoundEnabled: v })} />
            <label htmlFor="tone" style={{ display: "block", marginTop: "0.75rem" }}>Phone notification tone</label>
            <select id="tone" value={prefs.notificationToneId} onChange={(e) => patchPrefs({ notificationToneId: e.target.value })}>
              <option value="default">System default</option>
              <option value="chime">Chime</option>
              <option value="pulse">Pulse</option>
              <option value="soft">Soft</option>
            </select>
          </>
        )}
      </div>

      <div className="card">
        <h2>Office names</h2>
        <p className="help">Give an office your own name. Admins and colleagues still see the admin name.</p>
        {!offices ? (
          <span className="skeleton" style={{ height: 80 }} />
        ) : offices.length === 0 ? (
          <p className="muted">No offices yet.</p>
        ) : (
          offices.map((o) => <AliasRow key={o.id} office={o} onSave={saveAlias} />)
        )}
      </div>

      <div className="card">
        <h2>My devices</h2>
        <p className="help">
          Several phones can report for you. Evidence is merged per person, each visit day counts once, and if two phones
          disagree at the same moment the latest evidence wins.
        </p>
        {!devices ? (
          <span className="skeleton" style={{ height: 60 }} />
        ) : devices.length === 0 ? (
          <p className="muted">No phones signed in.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Device</th><th>Last seen</th><th></th></tr></thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td>{d.label ?? "Phone"} <span className="muted">({d.platform})</span></td>
                    <td>{fmtDateTime(d.lastSeenAt)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => rename(d.id, d.label)}>Rename</button>{" "}
                      <button className="btn btn-danger btn-sm" onClick={() => revoke(d.id)}>Sign out</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Peer presence</h2>
        <p className="help">{PEER_CONSENT_TEXT}</p>
        <Toggle label="Share with colleagues" hint="Off by default. You only see peers while you share too." checked={share} onChange={toggleShare} />
      </div>

      <div className="card">
        <h2>Rules (read only)</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
          <li>Monthly target: {policy.monthlyPointsTarget} points</li>
          <li>Any presence on a calendar day ({policy.timezone}) is a visit day. Each office sets points per visit day.</li>
          <li>Several offices in one day: the highest office&apos;s points count, once.</li>
          <li>Overnight stays split at local midnight; both days count.</li>
          <li>Hours are FYI only (advised {policy.dayHours}h). Short days are never penalized.</li>
          <li>Visit ends after {policy.gapMinutes} min without in-office evidence. Fence radius {policy.fenceRadiusMeters} m.</li>
        </ul>
      </div>

      <div className="card">
        <h2>Developer</h2>
        <Toggle label="Developer mode" hint="Test tools on the phone: 15s gap, mock GPS notes, inject, reset queue, suggest office." checked={dev} onChange={toggleDev} />
        {dev ? <SuggestOffice /> : null}
      </div>

      {msg ? <p className={`status-msg ${msg.kind}`}>{msg.text}</p> : null}
    </>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {hint ? <span className="help" style={{ display: "block", fontWeight: 400 }}>{hint}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function AliasRow({ office, onSave }: { office: Office; onSave: (id: string, name: string) => void }) {
  const [value, setValue] = useState(office.alias ?? "");
  return (
    <div className="toggle-row" style={{ alignItems: "flex-end" }}>
      <div style={{ flex: 1 }}>
        <strong>{office.adminName}</strong> <span className="badge badge-orange">{office.pointsPerVisitDay} pt/day</span>
        {office.addressLabel ? <div className="help">{office.addressLabel}</div> : null}
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your name for this office" style={{ marginBottom: 0 }} />
      </div>
      <button className="btn btn-secondary btn-sm" onClick={() => onSave(office.id, value.trim())}>Save</button>
    </div>
  );
}

function SuggestOffice() {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [msg, setMsg] = useState("");
  async function submit() {
    const res = await fetch("/api/me/developer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest_office", name, latitude: Number(lat), longitude: Number(lng) }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Suggested. An admin reviews it before it counts." : j.error ?? "Failed");
  }
  return (
    <div className="form-stack" style={{ marginTop: "0.75rem" }}>
      <label>Suggest a new office</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office name" />
      <div className="grid-2">
        <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" inputMode="decimal" />
        <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" inputMode="decimal" />
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" disabled={!name || !lat || !lng} onClick={submit}>Suggest office</button>
      </div>
      {msg ? <p className="help">{msg}</p> : null}
    </div>
  );
}
