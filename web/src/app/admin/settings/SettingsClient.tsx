"use client";

import { useState } from "react";
import type { OfficeTrackerSyncCard } from "@/lib/office-tracker-sync-status";
import ImportCard from "./ImportCard";

type Policy = {
  gapMinutes: number;
  dayHours: number;
  monthlyPointsTarget: number;
  timezone: string;
  fenceRadiusMeters: number;
  sampleIntervalMinutes?: number;
  correctionWindowDays?: number;
  correctionRequiresApproval?: boolean;
  correctionAutoApproveLimit?: number;
  correctionRequireSync?: boolean;
  correctionDailyDigest?: boolean;
  appVersionCode?: number;
  appVersionName?: string;
  appApkUrl?: string | null;
  rejectMockLocations?: boolean;
  rawLocationRetentionDays?: number;
  privacyNoticeVersion?: string;
  requireConsent?: boolean;
  allowSelfLeave?: boolean;
  allowExceptionsInClosedMonths?: boolean;
  managersDecideCorrections?: boolean;
};

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
];

export default function SettingsClient({
  policy: initial,
  lastSync = null,
}: {
  policy: Policy;
  activeOffices?: number;
  lastSync?: OfficeTrackerSyncCard | null;
}) {
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
      setPolicy({
        ...data.policy,
        monthlyPointsTarget: data.policy.monthlyPointsTarget ?? 8,
        correctionWindowDays: data.policy.correctionWindowDays ?? 5,
        correctionRequiresApproval: data.policy.correctionRequiresApproval === true,
        correctionAutoApproveLimit: data.policy.correctionAutoApproveLimit ?? 4,
        correctionRequireSync: data.policy.correctionRequireSync !== false,
        correctionDailyDigest: data.policy.correctionDailyDigest !== false,
        appVersionCode: data.policy.appVersionCode ?? 0,
        appVersionName: data.policy.appVersionName ?? "",
        appApkUrl: data.policy.appApkUrl ?? "",
        rejectMockLocations: data.policy.rejectMockLocations !== false,
        rawLocationRetentionDays: data.policy.rawLocationRetentionDays ?? 90,
        privacyNoticeVersion: data.policy.privacyNoticeVersion ?? "1",
        requireConsent: data.policy.requireConsent === true,
        allowSelfLeave: data.policy.allowSelfLeave !== false,
        allowExceptionsInClosedMonths: data.policy.allowExceptionsInClosedMonths !== false,
        managersDecideCorrections: data.policy.managersDecideCorrections === true,
      });
      setMessage("Rules saved");
      setMessageKind("ok");
    } else {
      setMessage(data.error ?? "Save failed");
      setMessageKind("error");
    }
  }

  const sample = policy.sampleIntervalMinutes ?? 10;

  return (
    <div>
      <div className="op-whead">
        <div>
          <h1>Rules</h1>
          <p className="op-sub">Apply to everyone. Phones show them read-only.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void savePolicy()}>
          {busy ? "Saving..." : "Save rules"}
        </button>
      </div>

      <div className="card" style={{ maxWidth: 820, padding: "8px 28px" }}>
        <div className="op-kv">
          <div className="k">
            <b>Monthly target</b>
            <small>Same for everyone, every month. Leave and holidays are recorded only.</small>
          </div>
          <div className="v">
            <input
              type="number"
              value={policy.monthlyPointsTarget}
              onChange={(e) => setPolicy({ ...policy, monthlyPointsTarget: Number(e.target.value) })}
              disabled={busy}
              aria-label="Monthly target points"
            />
            <span>points</span>
          </div>

          <div className="k">
            <b>Employees can mark their own leave</b>
            <small>Admins can always add leave</small>
          </div>
          <div className="v">
            <input
              type="checkbox"
              checked={policy.allowSelfLeave !== false}
              disabled={busy}
              aria-label="Employees can mark their own leave"
              onChange={(e) => setPolicy({ ...policy, allowSelfLeave: e.target.checked })}
            />
          </div>

          <div className="k">
            <b>HR exceptions</b>
            <small>Admins, and people with HR access in Users. Each day counts the home office points.</small>
          </div>
          <div className="v">
            <a className="op-ghost" href="/admin/exceptions">
              Open Exceptions
            </a>
          </div>

          <div className="k">
            <b>Allow exceptions in closed months</b>
            <small>Needs a reason. Always logged.</small>
          </div>
          <div className="v">
            <input
              type="checkbox"
              checked={policy.allowExceptionsInClosedMonths !== false}
              disabled={busy}
              aria-label="Allow exceptions in closed months"
              onChange={(e) => setPolicy({ ...policy, allowExceptionsInClosedMonths: e.target.checked })}
            />
          </div>

          <div className="k">
            <b>Counts as</b>
            <small>Points per visit day, set per office</small>
          </div>
          <div className="v">
            <a className="op-ghost" href="/admin/offices">
              Edit in Offices
            </a>
          </div>

          <div className="k">
            <b>A visit ends after a gap of</b>
            <small>No samples inside the office</small>
          </div>
          <div className="v">
            <input
              type="number"
              value={policy.gapMinutes}
              onChange={(e) => setPolicy({ ...policy, gapMinutes: Number(e.target.value) })}
              disabled={busy}
              aria-label="Gap minutes"
            />
            <span>minutes</span>
          </div>

          <div className="k">
            <b>Location sample</b>
            <small>Set by the app</small>
          </div>
          <div className="v">About every {sample} minutes</div>

          <div className="k">
            <b>Default office radius</b>
            <small>Used for new offices</small>
          </div>
          <div className="v">
            <input
              type="number"
              value={policy.fenceRadiusMeters}
              onChange={(e) => setPolicy({ ...policy, fenceRadiusMeters: Number(e.target.value) })}
              disabled={busy}
              aria-label="Default office radius"
            />
            <span>m</span>
          </div>

          <div className="k">
            <b>Ignore mock GPS for real accounts</b>
            <small>Fixes from a mock location app do not count. Test accounts always count. Needs app 2.1.0.</small>
          </div>
          <div className="v">
            <input
              type="checkbox"
              checked={policy.rejectMockLocations !== false}
              disabled={busy}
              aria-label="Ignore mock GPS for real accounts"
              onChange={(e) => setPolicy({ ...policy, rejectMockLocations: e.target.checked })}
            />
          </div>

          <div className="k">
            <b>Keep raw location for</b>
            <small>Coordinates and Wi-Fi are then cleared. Office and points stay.</small>
          </div>
          <div className="v">
            <input
              type="number"
              min={7}
              max={3650}
              value={policy.rawLocationRetentionDays ?? 90}
              onChange={(e) => setPolicy({ ...policy, rawLocationRetentionDays: Number(e.target.value) })}
              disabled={busy}
              aria-label="Raw location retention days"
            />
            <span>days</span>
          </div>

          <div className="k">
            <b>Privacy notice version</b>
            <small>Change it after editing the notice so everyone accepts again</small>
          </div>
          <div className="v">
            <input
              type="text"
              value={policy.privacyNoticeVersion ?? "1"}
              onChange={(e) => setPolicy({ ...policy, privacyNoticeVersion: e.target.value })}
              disabled={busy}
              aria-label="Privacy notice version"
            />
            <a className="op-ghost" href="/privacy" target="_blank" rel="noreferrer">
              Read the notice
            </a>
          </div>

          <div className="k">
            <b>Require consent</b>
            <small>Turn on after most phones are on app 2.1.0, because older apps cannot show the consent screen.</small>
          </div>
          <div className="v">
            <input
              type="checkbox"
              checked={policy.requireConsent === true}
              disabled={busy}
              aria-label="Require consent"
              onChange={(e) => setPolicy({ ...policy, requireConsent: e.target.checked })}
            />
          </div>

          <div className="k">
            <b>Suggested day</b>
            <small>Advice only, never affects points</small>
          </div>
          <div className="v">
            <input
              type="number"
              step="0.5"
              value={policy.dayHours}
              onChange={(e) => setPolicy({ ...policy, dayHours: Number(e.target.value) })}
              disabled={busy}
              aria-label="Suggested day hours"
            />
            <span>hours</span>
          </div>

          <div className="k">
            <b>Correction requests close</b>
            <small>After this the month is locked</small>
          </div>
          <div className="v">
            <input
              type="number"
              value={policy.correctionWindowDays ?? 5}
              onChange={(e) => setPolicy({ ...policy, correctionWindowDays: Number(e.target.value) })}
              disabled={busy}
              aria-label="Correction window days"
            />
            <span>days after month end</span>
          </div>

          <div className="k">
            <b>Correction approval</b>
            <small>Applies to corrections from Month and to fixes made on Today.</small>
          </div>
          <div className="v" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <label>
              <input
                type="radio"
                name="correction-approval"
                checked={policy.correctionRequiresApproval !== true}
                disabled={busy}
                onChange={() => setPolicy({ ...policy, correctionRequiresApproval: false })}
              />{" "}
              Auto approve
            </label>
            <label>
              <input
                type="radio"
                name="correction-approval"
                checked={policy.correctionRequiresApproval === true}
                disabled={busy}
                onChange={() => setPolicy({ ...policy, correctionRequiresApproval: true })}
              />{" "}
              Admin approves each one
            </label>
          </div>

          <div className="k">
            <b>Auto approve up to</b>
            <small>After this, the person&apos;s corrections need an admin that month</small>
          </div>
          <div className="v">
            <input
              type="number"
              min={0}
              value={policy.correctionAutoApproveLimit ?? 4}
              disabled={busy}
              aria-label="Auto approve limit"
              onChange={(e) => setPolicy({ ...policy, correctionAutoApproveLimit: Number(e.target.value) })}
            />
            <span>per person per month</span>
          </div>

          <div className="k">
            <b>Ask an admin when the phone sent no data that day</b>
          </div>
          <div className="v">
            <input
              type="checkbox"
              checked={policy.correctionRequireSync !== false}
              disabled={busy}
              aria-label="Require phone data"
              onChange={(e) => setPolicy({ ...policy, correctionRequireSync: e.target.checked })}
            />
          </div>

          <div className="k">
            <b>Daily digest of auto approved corrections</b>
            <small>Teams message to admins at 9:00</small>
          </div>
          <div className="v">
            <input
              type="checkbox"
              checked={policy.correctionDailyDigest !== false}
              disabled={busy}
              aria-label="Daily digest"
              onChange={(e) => setPolicy({ ...policy, correctionDailyDigest: e.target.checked })}
            />
          </div>

          <div className="k">
            <b>Managers can decide their team&apos;s corrections</b>
            <small>Managers never decide their own. Approve or Not approved only, no edits.</small>
          </div>
          <div className="v">
            <input
              type="checkbox"
              checked={policy.managersDecideCorrections === true}
              disabled={busy}
              aria-label="Managers can decide their team's corrections"
              onChange={(e) => setPolicy({ ...policy, managersDecideCorrections: e.target.checked })}
            />
          </div>

          <div className="k">
            <b>Who decides corrections</b>
            <small>Every decision is logged</small>
          </div>
          <div className="v">Any admin, except on their own requests</div>

          <div className="k">
            <b>Default timezone</b>
            <small>Used to decide which day a visit falls on</small>
          </div>
          <div className="v">
            <select
              className="tz"
              value={policy.timezone}
              onChange={(e) => setPolicy({ ...policy, timezone: e.target.value })}
              disabled={busy}
              aria-label="Default timezone"
            >
              {TIMEZONES.includes(policy.timezone) ? null : (
                <option value={policy.timezone}>{policy.timezone}</option>
              )}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div className="k">
            <b>Android version code</b>
            <small>Phones on an older version are notified once, then once a day until they install it. Opening the app asks them to open the download page.</small>
          </div>
          <div className="v">
            <input
              type="number"
              min={0}
              value={policy.appVersionCode ?? 0}
              onChange={(e) => setPolicy({ ...policy, appVersionCode: Number(e.target.value) })}
              disabled={busy}
              aria-label="Android version code"
            />
          </div>

          <div className="k">
            <b>Android version name</b>
            <small>Shown on the download page</small>
          </div>
          <div className="v">
            <input
              value={policy.appVersionName ?? ""}
              onChange={(e) => setPolicy({ ...policy, appVersionName: e.target.value })}
              disabled={busy}
              aria-label="Android version name"
            />
          </div>

          <div className="k">
            <b>APK URL</b>
            <small>Download file link. The notification opens the download page, not this file directly.</small>
          </div>
          <div className="v">
            <input
              value={policy.appApkUrl ?? ""}
              onChange={(e) => setPolicy({ ...policy, appApkUrl: e.target.value })}
              disabled={busy}
              aria-label="APK URL"
            />
          </div>
        </div>
      </div>

      <p className="op-meta-row" style={{ marginTop: 16 }}>
        A day counts once, even when several phones report it. The latest location wins.
      </p>
      {message ? <p className={`status-msg ${messageKind}`}>{message}</p> : null}
      <ImportCard lastSync={lastSync} />
    </div>
  );
}
