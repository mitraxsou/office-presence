"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  displayName,
  greeting,
  parseColleagueDisplayMode,
  type ColleagueDisplayMode,
} from "@/lib/display-name";
import { fmtClockHm, fmtSyncAgo, initials } from "@/lib/format";
import TimeClock from "@/components/TimeClock";

type Prefs = {
  notifyOfficeDetected: boolean;
  notifyOfficeEnter?: boolean;
  notifyOfficeLeave?: boolean;
  notifyGoalMet: boolean;
  notifyDailySummary: boolean;
  notifyCorrections?: boolean;
  notifyTrackingProblems?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  quietHoursDays?: string;
  quietHoursCustomDays?: string;
  quietAlertTracking?: boolean;
  quietAlertCorrections?: boolean;
};

type Office = {
  id: string;
  name: string;
  adminName: string;
  alias: string | null;
  pointsPerVisitDay: number;
  addressLabel: string | null;
};

type Device = {
  id: string;
  label: string | null;
  platform: string;
  lastSeenAt: string | null;
  createdAt: string;
};

type Section = "profile" | "notifications" | "sharing" | "appearance" | "nicknames" | "suggest";

export const PEER_CONSENT_TEXT =
  "Share my presence with colleagues who also opted in. Shared: In or Out, since when, and the office name. Not shared: live GPS, coordinates, hours, or points. You can turn this off at any time.";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "sharing", label: "Sharing and devices" },
  { id: "appearance", label: "Appearance" },
  { id: "nicknames", label: "Office nicknames" },
  { id: "suggest", label: "Suggest an office" },
];

export default function UserSettingsClient({
  section,
  viewAsReadonly,
  viewAsName,
  initial,
}: {
  section: Section;
  viewAsReadonly: boolean;
  viewAsName: string | null;
  initial: {
    developerMode: boolean;
    sharePresenceWithPeers: boolean;
    timezone: string;
    email: string;
    firstName: string;
    lastName: string;
    preferredName: string;
    colleagueDisplayMode: ColleagueDisplayMode;
    displayName: string;
    greeting: string;
  };
  policy: {
    monthlyPointsTarget: number;
    dayHours: number;
    gapMinutes: number;
    timezone: string;
    fenceRadiusMeters: number;
    correctionWindowDays?: number;
  };
}) {
  const router = useRouter();
  const readonlyReason = viewAsReadonly
    ? `Not available while viewing as ${viewAsName ?? "this user"}.`
    : null;

  const [theme, setTheme] = useState("system");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [share, setShare] = useState(initial.sharePresenceWithPeers);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [suggestName, setSuggestName] = useState("");
  const [suggestAddress, setSuggestAddress] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [preferredName, setPreferredName] = useState(initial.preferredName);
  const [mode, setMode] = useState<ColleagueDisplayMode>(initial.colleagueDisplayMode);
  const [profileBusy, setProfileBusy] = useState(false);

  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setTheme(localStorage.getItem("op-theme") ?? "system");
    fetch("/api/me/notification-prefs")
      .then((r) => r.json())
      .then((j) => setPrefs(j.prefs));
    fetch("/api/offices")
      .then((r) => r.json())
      .then((j) => setOffices(j.offices ?? []));
    fetch("/api/me/password")
      .then((r) => r.json())
      .then((j) => setHasPassword(!!j.hasPassword))
      .catch(() => setHasPassword(false));
    loadDevices();
  }, []);

  function loadDevices() {
    fetch("/api/me/devices")
      .then((r) => r.json())
      .then((j) => setDevices(j.devices ?? []));
  }

  function go(id: Section) {
    const q = id === "profile" ? "/settings" : `/settings?section=${id}`;
    router.push(q);
  }

  function applyTheme(t: string) {
    setTheme(t);
    if (t === "system") {
      localStorage.removeItem("op-theme");
      delete document.documentElement.dataset.theme;
      document.documentElement.classList.remove("dark", "light");
    } else {
      localStorage.setItem("op-theme", t);
      document.documentElement.dataset.theme = t;
      document.documentElement.classList.toggle("dark", t === "dark");
      document.documentElement.classList.toggle("light", t === "light");
    }
  }

  async function patchPrefs(patch: Partial<Prefs>) {
    if (viewAsReadonly) {
      setMsg({ kind: "error", text: readonlyReason ?? "Read only" });
      return;
    }
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

  async function saveAlias(officeLocationId: string, display: string) {
    if (viewAsReadonly) {
      setMsg({ kind: "error", text: readonlyReason ?? "Read only" });
      return;
    }
    const res = await fetch("/api/me/aliases", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officeLocationId, displayName: display }),
    });
    setMsg(
      res.ok
        ? { kind: "ok", text: display ? "Nickname saved" : "Nickname cleared" }
        : { kind: "error", text: "Could not save nickname" },
    );
    fetch("/api/offices")
      .then((r) => r.json())
      .then((j) => setOffices(j.offices ?? []));
  }

  async function revoke(id: string) {
    if (viewAsReadonly) {
      setMsg({ kind: "error", text: readonlyReason ?? "Read only" });
      return;
    }
    if (!window.confirm("Sign this device out? It stops sending presence until you sign in again.")) return;
    const res = await fetch(`/api/me/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setMsg(res.ok ? { kind: "ok", text: "Device signed out" } : { kind: "error", text: "Could not sign out device" });
    loadDevices();
  }

  async function toggleShare(next: boolean) {
    if (viewAsReadonly) {
      setMsg({ kind: "error", text: readonlyReason ?? "Read only" });
      return;
    }
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

  async function suggestOffice() {
    if (viewAsReadonly) {
      setMsg({ kind: "error", text: readonlyReason ?? "Read only" });
      return;
    }
    setSuggestBusy(true);
    setMsg(null);
    const res = await fetch("/api/me/offices/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: suggestName, address: suggestAddress }),
    });
    const j = await res.json().catch(() => ({}));
    setSuggestBusy(false);
    if (res.ok) {
      setSuggestName("");
      setSuggestAddress("");
      setMsg({ kind: "ok", text: "Suggested. An admin reviews it before it counts." });
    } else {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not suggest office" });
    }
  }

  const previewUser = useMemo(
    () => ({
      firstName,
      lastName,
      preferredName: preferredName.trim() || null,
      colleagueDisplayMode: mode,
      email: initial.email,
      name: `${firstName} ${lastName}`.trim(),
    }),
    [firstName, lastName, preferredName, mode, initial.email],
  );
  const previewGreeting = greeting(previewUser, new Date(), initial.timezone);
  const previewColleague = displayName(previewUser);

  async function saveProfile() {
    if (viewAsReadonly) {
      setMsg({ kind: "error", text: readonlyReason ?? "Read only" });
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setMsg({ kind: "error", text: "First name and last name are required" });
      return;
    }
    setProfileBusy(true);
    const res = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        preferredName: preferredName.trim() || null,
        colleagueDisplayMode: mode,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setProfileBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not save profile" });
      return;
    }
    setMsg({ kind: "ok", text: "Profile saved" });
    router.refresh();
  }

  function resetProfile() {
    setFirstName(initial.firstName);
    setLastName(initial.lastName);
    setPreferredName(initial.preferredName);
    setMode(initial.colleagueDisplayMode);
  }

  async function savePassword() {
    if (viewAsReadonly) {
      setMsg({ kind: "error", text: readonlyReason ?? "Read only" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ kind: "error", text: "Passwords do not match" });
      return;
    }
    setPasswordBusy(true);
    setMsg(null);
    const res = await fetch("/api/me/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: newPassword,
        confirmPassword,
        ...(hasPassword ? { currentPassword } : {}),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setPasswordBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not save password" });
      return;
    }
    setHasPassword(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMsg({ kind: "ok", text: hasPassword ? "Password updated" : "Password set. You can sign in with it on the next visit." });
  }

  const quietOn = !!(prefs?.quietHoursStart && prefs?.quietHoursEnd);
  const av = initials(`${firstName} ${lastName}`.trim() || initial.email, initial.email);

  return (
    <>
      <div className="op-whead">
        <h1 className="op-page-title">Settings</h1>
      </div>

      <div className="op-settings-layout">
        <nav className="op-subnav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "on" : undefined}
              onClick={() => go(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="op-settings">
          {readonlyReason && section !== "appearance" ? (
            <p className="op-meta" style={{ marginTop: 0 }}>
              {readonlyReason}
            </p>
          ) : null}

          {section === "profile" ? (
            <div className="card">
              <div className="row" style={{ gap: 16, display: "flex", alignItems: "center" }}>
                <div className="op-avatar lg" aria-hidden>
                  {av}
                </div>
                <div>
                  <div className="op-set-h">Profile</div>
                  <div className="op-meta">How your name appears in the app and to colleagues.</div>
                </div>
              </div>
              <div className="op-profile-grid">
                <label className="op-field">
                  <span className="op-field-lab">First name</span>
                  <input
                    className="op-input op-input-sm"
                    value={firstName}
                    maxLength={40}
                    disabled={viewAsReadonly}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label className="op-field">
                  <span className="op-field-lab">Last name</span>
                  <input
                    className="op-input op-input-sm"
                    value={lastName}
                    maxLength={40}
                    disabled={viewAsReadonly}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
                <label className="op-field">
                  <span className="op-field-lab">Preferred name (optional)</span>
                  <input
                    className="op-input op-input-sm"
                    value={preferredName}
                    maxLength={30}
                    disabled={viewAsReadonly}
                    onChange={(e) => setPreferredName(e.target.value)}
                  />
                  <span className="op-meta" style={{ display: "block", marginTop: 6 }}>
                    Used in greetings. Empty means your first name.
                  </span>
                </label>
                <label className="op-field">
                  <span className="op-field-lab">Email</span>
                  <input className="op-input op-input-sm" value={initial.email} readOnly disabled />
                  <span className="op-meta" style={{ display: "block", marginTop: 6 }}>
                    Set by PwC sign in. Ask an admin to change it.
                  </span>
                </label>
              </div>

              <div className="op-meta" style={{ fontWeight: 600, margin: "22px 0 8px" }}>
                Show me to colleagues as
              </div>
              <div className="op-display-opts">
                {(
                  [
                    ["first_last", `${firstName || "First"} ${lastName || "last"}`.trim(), "First and last"],
                    [
                      "preferred_last",
                      `${preferredName.trim() || firstName || "Preferred"} ${lastName || "last"}`.trim(),
                      "Preferred and last",
                    ],
                    ["preferred_only", preferredName.trim() || firstName || "Preferred", "Preferred only"],
                  ] as const
                ).map(([id, title, sub]) => (
                  <button
                    key={id}
                    type="button"
                    className={`op-display-opt ${mode === id ? "on" : ""}`}
                    disabled={viewAsReadonly}
                    onClick={() => setMode(parseColleagueDisplayMode(id))}
                  >
                    <span className="op-radio" aria-hidden />
                    <span>
                      <b>{title}</b>
                      <span className="op-meta">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="op-profile-preview">
                <div>
                  <div className="k">Greeting</div>
                  {previewGreeting}
                </div>
                <div>
                  <div className="k">Colleagues and admins see</div>
                  {previewColleague}
                </div>
              </div>

              <div className="row" style={{ marginTop: 22, gap: 10, display: "flex" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={viewAsReadonly || profileBusy}
                  onClick={() => void saveProfile()}
                >
                  Save profile
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={viewAsReadonly} onClick={resetProfile}>
                  Cancel
                </button>
              </div>

              <div className="op-set-h" style={{ marginTop: 32 }}>
                Password
              </div>
              <div className="op-meta" style={{ marginBottom: 12 }}>
                Optional. Sign in with email and password instead of a Teams code. At least 8 characters, no spaces.
              </div>
              {hasPassword ? (
                <label className="op-field">
                  <span className="op-field-lab">Current password</span>
                  <input
                    className="op-input op-input-sm"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    disabled={viewAsReadonly || passwordBusy}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
              ) : null}
              <div className="op-profile-grid" style={{ marginTop: hasPassword ? 12 : 0 }}>
                <label className="op-field">
                  <span className="op-field-lab">{hasPassword ? "New password" : "Password"}</span>
                  <input
                    className="op-input op-input-sm"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    disabled={viewAsReadonly || passwordBusy}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label className="op-field">
                  <span className="op-field-lab">Confirm password</span>
                  <input
                    className="op-input op-input-sm"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    disabled={viewAsReadonly || passwordBusy}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
              </div>
              <div className="row" style={{ marginTop: 16, gap: 10, display: "flex" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={
                    viewAsReadonly ||
                    passwordBusy ||
                    !newPassword ||
                    !confirmPassword ||
                    (hasPassword && !currentPassword)
                  }
                  onClick={() => void savePassword()}
                >
                  {passwordBusy ? "Saving" : hasPassword ? "Update password" : "Set password"}
                </button>
              </div>
            </div>
          ) : null}

          {section === "notifications" ? (
            <>
              <div className="card">
                <div className="op-set-h">Notifications</div>
                <div className="op-meta">These choices apply to all your phones.</div>
                {!prefs ? (
                  <span className="skeleton" style={{ height: 120, display: "block", marginTop: 12 }} />
                ) : (
                  <div className="op-lst" style={{ marginTop: 12 }}>
                    {(
                      [
                        {
                          key: "arrivals",
                          title: "Arrivals and leaving",
                          hint: "When you are In or Out at an office",
                          on: !!(prefs.notifyOfficeEnter ?? prefs.notifyOfficeDetected),
                          patch: {
                            notifyOfficeEnter: true,
                            notifyOfficeLeave: true,
                            notifyOfficeDetected: true,
                          } as Partial<Prefs>,
                          offPatch: {
                            notifyOfficeEnter: false,
                            notifyOfficeLeave: false,
                            notifyOfficeDetected: false,
                          } as Partial<Prefs>,
                        },
                        {
                          key: "goal",
                          title: "Goal met",
                          hint: "When you reach your points for the month",
                          on: !!prefs.notifyGoalMet,
                          patch: { notifyGoalMet: true },
                          offPatch: { notifyGoalMet: false },
                        },
                        {
                          key: "summary",
                          title: "Weekly summary",
                          hint: "Monday 9:00 am: points so far this month",
                          on: !!prefs.notifyDailySummary,
                          patch: { notifyDailySummary: true },
                          offPatch: { notifyDailySummary: false },
                        },
                        {
                          key: "corr",
                          title: "Correction requests",
                          hint: "When an admin decides on your request",
                          on: prefs.notifyCorrections !== false,
                          patch: { notifyCorrections: true },
                          offPatch: { notifyCorrections: false },
                        },
                        {
                          key: "track",
                          title: "Tracking problems",
                          hint: "Location off, or no sync for 24 h",
                          on: prefs.notifyTrackingProblems !== false,
                          recommended: true,
                          patch: { notifyTrackingProblems: true },
                          offPatch: { notifyTrackingProblems: false },
                        },
                      ] as const
                    ).map((row) => (
                      <div key={row.key} className="op-lst-it">
                        <div className="grow">
                          <div className="op-set-h" style={{ fontSize: 15 }}>
                            {row.title}
                            {"recommended" in row && row.recommended ? (
                              <span className="op-badge fyi" style={{ marginLeft: 8 }}>
                                Recommended
                              </span>
                            ) : null}
                          </div>
                          <div className="op-meta">{row.hint}</div>
                        </div>
                        <Switch
                          checked={row.on}
                          disabled={viewAsReadonly || !prefs}
                          label={row.title}
                          onChange={(v) => void patchPrefs(v ? row.patch : row.offPatch)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="op-set-row">
                  <div>
                    <div className="op-set-h">Quiet hours</div>
                    <div className="op-meta">Notifications arrive silently during these hours. They still show in the app.</div>
                  </div>
                  <Switch
                    checked={quietOn}
                    disabled={viewAsReadonly || !prefs}
                    label="Quiet hours"
                    onChange={(v) =>
                      void patchPrefs(
                        v
                          ? { quietHoursStart: prefs?.quietHoursStart || "21:00", quietHoursEnd: prefs?.quietHoursEnd || "08:00" }
                          : { quietHoursStart: null, quietHoursEnd: null },
                      )
                    }
                  />
                </div>
                {quietOn && prefs ? (
                  <QuietHoursEditor
                    prefs={prefs}
                    disabled={viewAsReadonly}
                    onPatch={(patch) => void patchPrefs(patch)}
                  />
                ) : null}
              </div>

              <div className="card">
                <div className="op-set-h">Sound and vibration</div>
                <div className="op-meta" style={{ marginTop: 2 }}>
                  Set on each phone, because Android controls tones and vibration. On the phone: You, Notifications,
                  Sound and vibration.
                </div>
              </div>
            </>
          ) : null}

          {section === "sharing" ? (
            <>
              <div className="card">
                <div className="op-set-row">
                  <div>
                    <div className="op-set-h">Share my status</div>
                    <div className="op-meta">Turn off at any time. Colleagues stop seeing you right away.</div>
                  </div>
                  <Switch
                    checked={share}
                    disabled={viewAsReadonly}
                    onChange={(v) => void toggleShare(v)}
                    label="Share my status"
                  />
                </div>
                <div className="op-share-boxes">
                  <div className="op-sunk-box">
                    <div className="op-set-h" style={{ fontSize: 14 }}>
                      Colleagues see
                    </div>
                    <div className="op-meta" style={{ marginTop: 4, color: "var(--op-ink)" }}>
                      In or Out, since when, office name
                    </div>
                  </div>
                  <div className="op-sunk-box">
                    <div className="op-set-h" style={{ fontSize: 14 }}>
                      Never shared
                    </div>
                    <div className="op-meta" style={{ marginTop: 4 }}>
                      Live GPS, coordinates, hours, points counted
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="op-set-h" style={{ marginBottom: 6 }}>
                  Devices
                </div>
                {!devices ? (
                  <span className="skeleton" style={{ height: 60, display: "block" }} />
                ) : devices.length === 0 ? (
                  <p className="op-meta" style={{ margin: 0 }}>
                    No phones signed in.
                  </p>
                ) : (
                  <div className="op-lst">
                    {devices.map((d) => (
                      <div key={d.id} className="op-lst-it">
                        <div className="grow">
                          <b>{d.label ?? "Phone"}</b>
                          <div className="op-meta">{fmtSyncAgo(d.lastSeenAt)}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          disabled={viewAsReadonly}
                          onClick={() => void revoke(d.id)}
                        >
                          Sign out device
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          {section === "appearance" ? (
            <div className="card">
              <div className="op-set-row">
                <div className="op-set-h">Appearance</div>
                <div className="op-seg" role="group" aria-label="Appearance">
                  {(
                    [
                      ["system", "System"],
                      ["light", "Light"],
                      ["dark", "Dark"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={theme === id ? "on" : undefined}
                      onClick={() => applyTheme(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {section === "nicknames" ? (
            <div className="card">
              <div className="op-set-h" style={{ marginBottom: 6 }}>
                Office nicknames
              </div>
              {!offices ? (
                <span className="skeleton" style={{ height: 60, display: "block" }} />
              ) : offices.length === 0 ? (
                <p className="op-meta" style={{ margin: 0 }}>
                  No offices yet.
                </p>
              ) : (
                <div className="op-lst">
                  {offices.map((o) => (
                    <AliasRow
                      key={o.id}
                      office={o}
                      disabled={viewAsReadonly}
                      onSave={saveAlias}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {section === "suggest" ? (
            <div className="card">
              <div className="op-set-h">Suggest an office</div>
              <div className="op-meta">An admin reviews it before it counts.</div>
              <div className="op-suggest-grid">
                <input
                  className="op-input op-input-sm"
                  value={suggestName}
                  disabled={viewAsReadonly}
                  onChange={(e) => setSuggestName(e.target.value)}
                  placeholder="Office name"
                />
                <input
                  className="op-input op-input-sm"
                  value={suggestAddress}
                  disabled={viewAsReadonly}
                  onChange={(e) => setSuggestAddress(e.target.value)}
                  placeholder="Address"
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 14 }}
                disabled={viewAsReadonly || suggestBusy || !suggestName.trim() || !suggestAddress.trim()}
                onClick={() => void suggestOffice()}
              >
                {suggestBusy ? "Sending..." : "Suggest office"}
              </button>
            </div>
          ) : null}

          {msg ? <p className={`status-msg ${msg.kind}`}>{msg.text}</p> : null}
        </div>
      </div>
    </>
  );
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function quietMinutes(hm?: string | null) {
  if (!hm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) return null;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function customDayList(raw?: string | null) {
  const nums = (raw || "1,2,3,4,5")
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  return [...new Set(nums)].sort((a, b) => a - b);
}

function QuietHoursEditor({
  prefs,
  disabled,
  onPatch,
}: {
  prefs: Prefs;
  disabled: boolean;
  onPatch: (patch: Partial<Prefs>) => void;
}) {
  const mode = prefs.quietHoursDays === "weekdays" || prefs.quietHoursDays === "custom" ? prefs.quietHoursDays : "all";
  const custom = customDayList(prefs.quietHoursCustomDays);
  const selected = mode === "weekdays" ? [1, 2, 3, 4, 5] : mode === "custom" ? custom : [1, 2, 3, 4, 5, 6, 7];
  const startMin = quietMinutes(prefs.quietHoursStart);
  const endMin = quietMinutes(prefs.quietHoursEnd);
  const nextDay = startMin != null && endMin != null && endMin < startMin;

  function selectMode(next: string) {
    const patch: Partial<Prefs> = { quietHoursDays: next };
    if (next === "custom" && mode !== "custom") {
      patch.quietHoursCustomDays = mode === "weekdays" ? "1,2,3,4,5" : "1,2,3,4,5,6,7";
    }
    onPatch(patch);
  }

  function toggleDay(day: number) {
    if (mode !== "custom") return;
    const set = new Set(custom);
    if (set.has(day)) {
      if (set.size <= 1) return;
      set.delete(day);
    } else {
      set.add(day);
    }
    onPatch({ quietHoursCustomDays: [...set].sort((a, b) => a - b).join(",") });
  }

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <TimeClock
          label="From"
          value={(prefs.quietHoursStart ?? "21:00").slice(0, 5)}
          onChange={(hm) => onPatch({ quietHoursStart: hm })}
        />
        <TimeClock
          label="To"
          value={(prefs.quietHoursEnd ?? "08:00").slice(0, 5)}
          previous={(prefs.quietHoursStart ?? "21:00").slice(0, 5)}
          onChange={(hm) => onPatch({ quietHoursEnd: hm })}
        />
        <span className="op-meta">
          {fmtClockHm(prefs.quietHoursStart)} to {fmtClockHm(prefs.quietHoursEnd)}
          {nextDay ? ", next day" : ""}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            ["all", "Every day"],
            ["weekdays", "Weekdays"],
            ["custom", "Custom"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mode === id ? "op-chip on" : "op-chip"}
            disabled={disabled}
            onClick={() => selectMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {DAY_LETTERS.map((letter, index) => {
          const day = index + 1;
          const on = selected.includes(day);
          return (
            <button
              key={DAY_NAMES[index]}
              type="button"
              aria-pressed={on}
              aria-label={DAY_NAMES[index]}
              disabled={disabled || mode !== "custom"}
              onClick={() => toggleDay(day)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: "1px solid var(--op-line-strong)",
                background: on ? "var(--op-ink)" : "var(--op-surface)",
                color: on ? "var(--op-bg)" : "var(--op-ink-2)",
                fontWeight: 700,
              }}
            >
              {letter}
            </button>
          );
        })}
      </div>
      <div className="op-set-row">
        <div>
          <div className="op-set-h" style={{ fontSize: 15 }}>
            Still alert for tracking problems
            <span className="op-badge fyi" style={{ marginLeft: 8 }}>
              Recommended
            </span>
          </div>
        </div>
        <Switch
          checked={prefs.quietAlertTracking !== false}
          disabled={disabled}
          label="Still alert for tracking problems"
          onChange={(v) => onPatch({ quietAlertTracking: v })}
        />
      </div>
      <div className="op-set-row">
        <div className="op-set-h" style={{ fontSize: 15 }}>
          Still alert for correction decisions
        </div>
        <Switch
          checked={!!prefs.quietAlertCorrections}
          disabled={disabled}
          label="Still alert for correction decisions"
          onChange={(v) => onPatch({ quietAlertCorrections: v })}
        />
      </div>
      <div className="op-meta">Saved to your account. Each phone applies it in its own time zone.</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`op-switch ${checked ? "on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

function AliasRow({
  office,
  onSave,
  disabled,
}: {
  office: Office;
  onSave: (id: string, name: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(office.alias ?? "");
  return (
    <div className="op-lst-it">
      <span className="grow">{office.adminName || office.name}</span>
      <input
        className="op-input op-input-sm"
        style={{ width: 220, margin: 0 }}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if ((office.alias ?? "") !== value.trim()) onSave(office.id, value.trim());
        }}
        placeholder="Add a nickname"
        aria-label={`Nickname for ${office.adminName || office.name}`}
      />
    </div>
  );
}
