"use client";

import type { FrameId } from "./fixtures";
import {
  FRAME_ADMIN,
  FRAME_COLLEAGUES,
  FRAME_CORRECTION,
  FRAME_CORRECTION_REQUESTS,
  FRAME_CORRECTIONS_QUEUE,
  FRAME_DAY_DETAIL,
  FRAME_DEVICES,
  FRAME_MONTH_DAYS,
  FRAME_OFFICES,
  FRAME_PERSON,
  FRAME_ROSTER_ROWS,
  FRAME_ROSTER_STATS,
  FRAME_TODAY,
} from "./fixtures";
import { DaysMeter, HoursFyiRow, StatusHero, ColleagueRow, StatusBadge } from "@/components/op/DesignKit";

/** Dev-only frame previews used by Playwright screenshot diffs. */
export function FramePreview({ frame }: { frame: FrameId }) {
  const dark = frame.includes("Dark");
  const phone = frame.startsWith("0") || frame.match(/^\d+_P-/);
  return (
    <div
      data-frame={frame}
      data-theme={dark ? "dark" : "light"}
      className={dark ? "dark" : "light"}
      style={{
        width: phone ? 390 : 1024,
        minHeight: phone ? 844 : 768,
        margin: 0,
        background: "var(--op-bg)",
        color: "var(--op-ink)",
        fontFamily: "var(--op-font)",
      }}
    >
      {renderFrame(frame)}
    </div>
  );
}

function renderFrame(frame: FrameId | string) {
  // v8 handoff renumbered frames; map both pre-v8 and v8 ids onto the same previews.
  const v8: Record<string, string> = {
    "05_P-Login-Email": "03_P-Login-Email",
    "06_P-Login-Code": "04_P-Login-Code",
    "07_P-Login-Sending-code": "05_P-Login-Sending-code",
    "08_P-Login-Code-failed": "06_P-Login-Code-failed",
    "09_P-Today-In": "07_P-Today-In",
    "10_P-Today-In-Dark": "08_P-Today-In-Dark",
    "11_P-Today-In-second-office": "07_P-Today-In",
    "12_P-Today-In-real-data-check": "07_P-Today-In",
    "13_P-Today-Out": "09_P-Today-Out",
    "14_P-Today-Permissions-needed": "10_P-Today-Permissions-needed",
    "15_P-Today-Loading": "11_P-Today-Loading",
    "16_P-Month-In-progress": "12_P-Month-In-progress",
    "17_P-Month-In-progress-Dark": "13_P-Month-In-progress-Dark",
    "18_P-Month-Goal-met": "14_P-Month-Goal-met",
    "19_P-Month-Day-detail": "15_P-Month-Day-detail",
    "20_P-Correction-Choose-issue": "16_P-Correction-Choose-issue",
    "21_P-Correction-Edit-day": "17_P-Correction-Edit-day",
    "22_P-Correction-Review-and-send": "18_P-Correction-Review-and-send",
    "23_P-Correction-Sent": "19_P-Correction-Sent",
    "24_P-Month-Day-with-several-offices": "15_P-Month-Day-detail",
    "25_P-Month-Day-pending": "20_P-Month-Day-pending",
    "26_P-Correction-Approved": "21_P-Correction-Approved",
    "27_P-Correction-Not-approved": "22_P-Correction-Not-approved",
    "28_P-You-Correction-requests": "23_P-You-Correction-requests",
    "37_P-Colleagues-List": "24_P-Colleagues-List",
    "38_P-Colleagues-List-Dark": "25_P-Colleagues-List-Dark",
    "39_P-Colleagues-Opted-out": "26_P-Colleagues-Opted-out",
    "40_P-Colleagues-Empty": "27_P-Colleagues-Empty",
    "41_P-You-Settings": "28_P-You-Settings",
    "48_P-You-Devices": "29_P-You-Devices",
    "68_W-Login": "30_W-Login",
    "69_W-Login-Sending-code": "31_W-Login-Sending-code",
    "70_W-Login-Code-failed": "32_W-Login-Code-failed",
    "71_W-Month": "33_W-Month",
    "72_W-Month-Day-open": "34_W-Month-Day-open",
    "73_W-Month-Day-with-several-offices": "34_W-Month-Day-open",
    "74_W-Month-Request-a-correction": "35_W-Month-Request-a-correction",
    "75_W-Colleagues": "36_W-Colleagues",
    "76_W-Settings-Profile": "37_W-Settings",
    "79_W-Admin-Roster": "38_W-Admin-Roster",
    "80_W-Admin-Roster-Dark": "39_W-Admin-Roster-Dark",
    "81_W-Admin-Roster-Loading": "40_W-Admin-Roster-Loading",
    "82_W-Admin-Roster-Empty": "41_W-Admin-Roster-Empty",
    "83_W-Admin-Roster-Error": "42_W-Admin-Roster-Error",
    "84_W-Admin-Corrections": "43_W-Admin-Corrections",
    "85_W-Admin-Corrections-Review": "44_W-Admin-Corrections-Review",
    "86_W-Admin-Corrections-Reject": "45_W-Admin-Corrections-Reject",
    "87_W-Admin-Corrections-Empty": "46_W-Admin-Corrections-Empty",
    "101_W-Admin-Offices-list-plus-map": "47_W-Admin-Offices-list-plus-map",
    "103_W-Admin-Reports": "48_W-Admin-Reports",
    "104_W-Admin-Rules": "49_W-Admin-Rules",
    "105_W-Admin-Person-visits": "50_W-Admin-Person-visits",
    "106_W-Admin-Person-visits-Edit-day": "50_W-Admin-Person-visits",
    "110_W-Admin-Person-visits-Own-record": "50_W-Admin-Person-visits",
  };
  const id = v8[frame] ?? frame;
  switch (id) {
    case "03_P-Login-Email":
    case "30_W-Login":
      return <LoginFrame state="email" phone={String(id).startsWith("0")} />;
    case "04_P-Login-Code":
      return <LoginFrame state="code" phone />;
    case "05_P-Login-Sending-code":
    case "31_W-Login-Sending-code":
      return <LoginFrame state="sending" phone={String(id).startsWith("0")} />;
    case "06_P-Login-Code-failed":
    case "32_W-Login-Code-failed":
      return <LoginFrame state="failed" phone={String(id).startsWith("0")} />;
    case "07_P-Today-In":
    case "08_P-Today-In-Dark":
      return <TodayFrame variant="in" />;
    case "09_P-Today-Out":
      return <TodayFrame variant="out" />;
    case "10_P-Today-Permissions-needed":
      return <TodayFrame variant="permissions" />;
    case "11_P-Today-Loading":
      return <TodayFrame variant="loading" />;
    case "12_P-Month-In-progress":
    case "13_P-Month-In-progress-Dark":
      return <MonthFrame variant="progress" />;
    case "14_P-Month-Goal-met":
      return <MonthFrame variant="goal" />;
    case "15_P-Month-Day-detail":
      return <MonthFrame variant="day" />;
    case "20_P-Month-Day-pending":
      return <MonthFrame variant="pending" />;
    case "21_P-Correction-Approved":
      return <MonthFrame variant="approved" />;
    case "22_P-Correction-Not-approved":
      return <MonthFrame variant="rejected" />;
    case "16_P-Correction-Choose-issue":
      return <CorrectionFrame step="issue" />;
    case "17_P-Correction-Edit-day":
      return <CorrectionFrame step="edit" />;
    case "18_P-Correction-Review-and-send":
      return <CorrectionFrame step="review" />;
    case "19_P-Correction-Sent":
      return <CorrectionFrame step="sent" />;
    case "23_P-You-Correction-requests":
      return <YouCorrectionsFrame />;
    case "24_P-Colleagues-List":
    case "25_P-Colleagues-List-Dark":
      return <ColleaguesFrame variant="list" />;
    case "26_P-Colleagues-Opted-out":
      return <ColleaguesFrame variant="opted-out" />;
    case "27_P-Colleagues-Empty":
      return <ColleaguesFrame variant="empty" />;
    case "28_P-You-Settings":
      return <YouSettingsFrame />;
    case "29_P-You-Devices":
      return <YouDevicesFrame />;
    case "33_W-Month":
      return <WebMonthFrame drawer={null} />;
    case "34_W-Month-Day-open":
      return <WebMonthFrame drawer="day" />;
    case "35_W-Month-Request-a-correction":
      return <WebMonthFrame drawer="correction" />;
    case "36_W-Colleagues":
      return <WebColleaguesFrame />;
    case "37_W-Settings":
      return <WebSettingsFrame />;
    case "38_W-Admin-Roster":
    case "39_W-Admin-Roster-Dark":
      return <WebRosterFrame variant="ready" />;
    case "40_W-Admin-Roster-Loading":
      return <WebRosterFrame variant="loading" />;
    case "41_W-Admin-Roster-Empty":
      return <WebRosterFrame variant="empty" />;
    case "42_W-Admin-Roster-Error":
      return <WebRosterFrame variant="error" />;
    case "43_W-Admin-Corrections":
      return <WebCorrectionsFrame variant="list" />;
    case "44_W-Admin-Corrections-Review":
      return <WebCorrectionsFrame variant="review" />;
    case "45_W-Admin-Corrections-Reject":
      return <WebCorrectionsFrame variant="reject" />;
    case "46_W-Admin-Corrections-Empty":
      return <WebCorrectionsFrame variant="empty" />;
    case "47_W-Admin-Offices-list-plus-map":
      return <WebOfficesFrame />;
    case "48_W-Admin-Reports":
      return <WebReportsFrame />;
    case "49_W-Admin-Rules":
      return <WebRulesFrame />;
    case "50_W-Admin-Person-visits":
      return <WebPersonVisitsFrame />;
    default:
      return <div style={{ padding: 24 }}>Frame {frame}</div>;
  }
}

function PhoneChrome({ children, tab = "Today" }: { children: React.ReactNode; tab?: string }) {
  const tabs = ["Today", "Month", "Colleagues", "You"];
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 844, background: "var(--op-bg)" }}>
      <div style={{ flex: 1, padding: 20, overflow: "hidden" }}>{children}</div>
      <div
        style={{
          height: 88,
          display: "flex",
          background: "var(--op-surface)",
          borderTop: "1px solid var(--op-line)",
          paddingBottom: 12,
        }}
      >
        {tabs.map((t) => (
          <div
            key={t}
            style={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              color: t === tab ? "var(--op-accent)" : "var(--op-ink-3)",
              fontWeight: t === tab ? 600 : 400,
            }}
          >
            <span
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                background: t === tab ? "var(--op-accent-wash)" : "transparent",
              }}
            >
              {t}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WebShell({
  active,
  admin,
  children,
}: {
  active: string;
  admin?: boolean;
  children: React.ReactNode;
}) {
  const person = admin ? FRAME_ADMIN : FRAME_PERSON;
  const links = admin
    ? ["My month", "Colleagues", "Settings", "Roster", "Corrections", "Offices", "Reports", "Rules"]
    : ["My month", "Colleagues", "Settings"];
  return (
    <div style={{ display: "flex", minHeight: 768 }}>
      <aside
        style={{
          width: 248,
          background: "var(--op-surface)",
          borderRight: "1px solid var(--op-line)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ color: "var(--op-accent)", fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Office Presence</div>
        {links.map((l) => (
          <div
            key={l}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              background: l === active ? "var(--op-accent-wash)" : "transparent",
              color: l === active ? "var(--op-accent)" : "var(--op-ink)",
              fontWeight: l === active ? 600 : 500,
              fontSize: 14,
            }}
          >
            {l}
            {l === "Corrections" ? (
              <span
                style={{
                  marginLeft: 8,
                  background: "var(--op-accent)",
                  color: "var(--op-on-accent)",
                  borderRadius: 999,
                  padding: "1px 7px",
                  fontSize: 12,
                }}
              >
                5
              </span>
            ) : null}
          </div>
        ))}
        <div style={{ marginTop: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "var(--op-sunk)",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
            }}
          >
            {person.initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{person.name}</div>
            <div style={{ color: "var(--op-ink-3)", fontSize: 12 }}>{admin ? "Admin" : person.email}</div>
          </div>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, maxWidth: 1120 }}>{children}</main>
    </div>
  );
}

function LoginFrame({ state, phone }: { state: "email" | "code" | "sending" | "failed"; phone: boolean }) {
  const wrap = (node: React.ReactNode) =>
    phone ? <div style={{ padding: 24, minHeight: 844 }}>{node}</div> : <div style={{ maxWidth: 420, margin: "80px auto" }}>{node}</div>;
  return wrap(
    <>
      <div style={{ color: "var(--op-accent)", fontWeight: 700, marginBottom: 32 }}>Office Presence</div>
      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Sign in</h1>
      <p style={{ color: "var(--op-ink-2)", marginTop: 0 }}>
        Use your PwC email. We send a 6-digit code to you in Microsoft Teams.
      </p>
      <label style={{ fontSize: 14, color: "var(--op-ink-2)" }}>Work email</label>
      <input
        readOnly
        value={state === "email" ? "" : FRAME_PERSON.email}
        placeholder="name@pwc.com"
        style={{
          width: "100%",
          marginTop: 6,
          padding: 14,
          borderRadius: 12,
          border: "1px solid var(--op-line-strong)",
          background: "var(--op-surface)",
        }}
      />
      {(state === "code" || state === "failed") && (
        <>
          <label style={{ fontSize: 14, color: "var(--op-ink-2)", display: "block", marginTop: 16 }}>Code</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {"123456".split("").map((d, i) => (
              <div
                key={i}
                style={{
                  width: 44,
                  height: 52,
                  borderRadius: 12,
                  border: `1px solid ${state === "failed" ? "var(--op-ink-2)" : "var(--op-line-strong)"}`,
                  display: "grid",
                  placeItems: "center",
                  background: "var(--op-surface)",
                  fontWeight: 600,
                }}
              >
                {state === "code" ? d : ""}
              </div>
            ))}
          </div>
        </>
      )}
      {state === "failed" ? <p style={{ color: "var(--op-ink-2)" }}>Code failed. Try again.</p> : null}
      {state === "sending" ? <p style={{ color: "var(--op-ink-2)" }}>Sending code...</p> : null}
      <button
        className="btn btn-primary"
        style={{
          width: "100%",
          marginTop: 24,
          opacity: state === "email" ? 0.45 : 1,
          height: 48,
          borderRadius: 999,
          border: "none",
          background: "var(--op-accent)",
          color: "var(--op-on-accent)",
          fontWeight: 600,
        }}
      >
        {state === "email" || state === "sending" ? "Send code" : "Verify and continue"}
      </button>
      <p style={{ textAlign: "center", color: "var(--op-ink-3)", fontSize: 13 }}>
        Or sign in with a password you set in Settings.
      </p>
    </>,
  );
}

function TodayFrame({ variant }: { variant: "in" | "out" | "permissions" | "loading" }) {
  if (variant === "loading") {
    return (
      <PhoneChrome>
        <div style={{ height: 24, width: 160, background: "var(--op-sunk)", borderRadius: 8, marginBottom: 16 }} />
        <div style={{ height: 96, background: "var(--op-sunk)", borderRadius: 20, marginBottom: 12 }} />
        <div style={{ height: 80, background: "var(--op-sunk)", borderRadius: 20 }} />
      </PhoneChrome>
    );
  }
  const inOffice = variant === "in" || variant === "permissions";
  return (
    <PhoneChrome tab="Today">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ color: "var(--op-accent)", fontWeight: 700 }}>Office Presence</div>
        <div style={{ color: "var(--op-ink-3)", fontSize: 12 }}>{FRAME_TODAY.updatedAgo}</div>
      </div>
      {variant === "permissions" ? (
        <div
          style={{
            background: "var(--op-accent-wash)",
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <strong>Location permission needed</strong>
          <p style={{ margin: "8px 0 12px", color: "var(--op-ink-2)", fontSize: 14 }}>
            Visits close when you leave. Allow location all the time.
          </p>
          <button className="btn btn-primary" style={{ borderRadius: 999, background: "var(--op-accent)", border: "none", padding: "10px 16px" }}>
            Grant permissions
          </button>
        </div>
      ) : null}
      <StatusHero
        inOffice={inOffice}
        officeName={inOffice ? FRAME_TODAY.officeName : null}
        sinceLabel={inOffice ? FRAME_TODAY.sinceLabel : null}
      />
      <div style={{ background: "var(--op-surface)", borderRadius: 20, padding: 16, border: "1px solid var(--op-line)" }}>
        <DaysMeter current={FRAME_TODAY.monthPoints} target={FRAME_TODAY.pointsTarget} />
        <HoursFyiRow hours={FRAME_TODAY.hoursToday} advised={5} />
      </div>
      {variant === "in" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          {FRAME_TODAY.colleaguesIn.map((c) => (
            <div
              key={c.initials}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: "var(--op-accent-wash)",
                color: "var(--op-accent)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 12,
                marginLeft: -6,
              }}
            >
              {c.initials}
            </div>
          ))}
          <span style={{ color: "var(--op-ink-2)", fontSize: 14 }}>3 colleagues In</span>
        </div>
      ) : null}
      <button
        style={{
          marginTop: 20,
          width: "100%",
          height: 48,
          borderRadius: 999,
          background: "var(--op-accent)",
          color: "var(--op-on-accent)",
          border: "none",
          fontWeight: 600,
        }}
      >
        Check now
      </button>
    </PhoneChrome>
  );
}

function MonthFrame({ variant }: { variant: "progress" | "goal" | "day" | "pending" | "approved" | "rejected" }) {
  const points = variant === "goal" || variant === "approved" ? 6 : 5;
  const side = points >= 8 ? "Goal met" : `${8 - points} to go`;
  return (
    <PhoneChrome tab="Month">
      <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 16 }}>{"< October 2026 >"}</div>
      <div style={{ background: "var(--op-surface)", borderRadius: 20, padding: 16, border: "1px solid var(--op-line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ font: "var(--op-text-number)", fontSize: 40 }}>{points} / 8 days</span>
          <span className={`op-badge ${points >= 8 ? "goal" : "todo"}`}>{side}</span>
        </div>
        <div className="op-days-track" style={{ marginTop: 10 }}>
          <div className="op-days-fill" style={{ width: `${(points / 8) * 100}%` }} />
        </div>
        <p style={{ color: "var(--op-ink-3)", fontSize: 13 }}>
          {variant === "approved" ? "5 visits. 1 corrected." : "4 visits. Kolkata counts as 2 days."}
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 16 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
          <div key={d} style={{ textAlign: "center", color: "var(--op-ink-3)", fontSize: 12 }}>
            {d}
          </div>
        ))}
        {Array.from({ length: 31 }, (_, i) => {
          const day = i + 1;
          const hit = FRAME_MONTH_DAYS.find((d) => Number(d.dayKey.slice(8)) === day);
          const selected = (variant !== "progress" && variant !== "goal" && day === 15) || day === 27;
          return (
            <div
              key={day}
              style={{
                aspectRatio: "1",
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: hit ? "var(--op-accent)" : "transparent",
                color: hit ? "var(--op-on-accent)" : "var(--op-ink)",
                outline: selected ? "2px solid var(--op-ink)" : variant === "pending" && day === 15 ? "2px dashed var(--op-accent)" : "none",
                fontSize: 13,
                fontWeight: 600,
                position: "relative",
              }}
            >
              {day}
              {hit && hit.points === 2 ? (
                <span style={{ position: "absolute", top: -4, right: -4, background: "var(--op-sunk)", borderRadius: 999, fontSize: 10, padding: "0 4px" }}>2</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {(variant === "day" || variant === "pending" || variant === "approved" || variant === "rejected") && (
        <div
          style={{
            marginTop: 16,
            background: "var(--op-surface)",
            borderRadius: "24px 24px 0 0",
            padding: 20,
            border: "1px solid var(--op-line)",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.08)",
          }}
        >
          {variant === "approved" ? (
            <div style={{ background: "var(--op-ink)", color: "var(--op-bg)", borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13 }}>
              Your correction for 15 Oct was approved. October is now 6 / 8 days.
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>{FRAME_DAY_DETAIL.weekday}</h2>
            <StatusBadge inOffice={false} />
            {variant === "pending" ? <span className="op-badge accent">Pending review</span> : null}
            {variant === "approved" ? <span className="op-badge">Approved</span> : null}
            {variant === "rejected" ? <span className="op-badge">Not approved</span> : null}
          </div>
          {variant === "day" || variant === "pending" ? (
            <>
              <p style={{ color: "var(--op-ink-2)" }}>No visit recorded.</p>
              <button style={{ width: "100%", height: 48, borderRadius: 999, background: "var(--op-accent)", border: "none", fontWeight: 600 }}>
                {variant === "pending" ? "Cancel request" : "Request a correction"}
              </button>
            </>
          ) : null}
          {variant === "approved" ? (
            <>
              <p style={{ color: "var(--op-ink-2)" }}>Gurugram, Tower B, counts as 1 day</p>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>9:30 am to 6:00 pm</span>
                <span className="op-badge accent">Corrected</span>
                <span>8 h 30 m</span>
              </div>
              <p style={{ color: "var(--op-ink-3)", fontSize: 12 }}>Approved by Kavya Rao on 28 Oct. The original record is kept in history.</p>
            </>
          ) : null}
          {variant === "rejected" ? (
            <>
              <p style={{ color: "var(--op-ink-2)" }}>Not approved: times do not match building access.</p>
              <button style={{ width: "100%", height: 48, borderRadius: 999, background: "var(--op-accent)", border: "none", fontWeight: 600 }}>
                Request again
              </button>
            </>
          ) : null}
        </div>
      )}
    </PhoneChrome>
  );
}

function CorrectionFrame({ step }: { step: "issue" | "edit" | "review" | "sent" }) {
  const seg = step === "issue" ? 1 : step === "edit" ? 2 : 3;
  return (
    <div style={{ padding: 20, minHeight: 844, background: "var(--op-bg)" }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{"< Correct Thu 15 Oct"}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i <= seg ? "var(--op-accent)" : "var(--op-sunk)" }} />
        ))}
      </div>
      {step === "issue" && (
        <>
          <h1 style={{ fontSize: 28 }}>What is wrong?</h1>
          {["A visit is missing", "Times are wrong", "Wrong office", "Should not count"].map((t, i) => (
            <div
              key={t}
              style={{
                padding: 16,
                borderRadius: 16,
                background: "var(--op-surface)",
                border: `1px solid ${i === 0 ? "var(--op-accent)" : "var(--op-line)"}`,
                marginBottom: 10,
              }}
            >
              {t}
            </div>
          ))}
        </>
      )}
      {step === "edit" && (
        <>
          <h1 style={{ fontSize: 28 }}>Edit the day</h1>
          <label>Office</label>
          <div style={{ padding: 14, borderRadius: 12, background: "var(--op-surface)", border: "1px solid var(--op-line)", marginBottom: 12 }}>
            {FRAME_CORRECTION.officeName}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label>In</label>
              <div style={{ padding: 14, borderRadius: 12, background: "var(--op-surface)", border: "1px solid var(--op-line)" }}>{FRAME_CORRECTION.inAt}</div>
            </div>
            <div>
              <label>Out</label>
              <div style={{ padding: 14, borderRadius: 12, background: "var(--op-surface)", border: "1px solid var(--op-line)" }}>{FRAME_CORRECTION.outAt}</div>
            </div>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>Reason</label>
          <div style={{ padding: 14, borderRadius: 12, background: "var(--op-surface)", border: "1px solid var(--op-line)", minHeight: 80 }}>
            {FRAME_CORRECTION.reason}
          </div>
          <button style={{ width: "100%", marginTop: 20, height: 48, borderRadius: 999, background: "var(--op-accent)", border: "none", fontWeight: 600 }}>
            Continue
          </button>
        </>
      )}
      {step === "review" && (
        <>
          <h1 style={{ fontSize: 28 }}>Check your request</h1>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: 16, overflow: "hidden", border: "1px solid var(--op-line)" }}>
            <div style={{ padding: 16, background: "var(--op-surface)" }}>
              <div style={{ color: "var(--op-ink-3)", fontSize: 12 }}>Recorded</div>
              <div>No visit</div>
            </div>
            <div style={{ padding: 16, background: "var(--op-accent-wash)" }}>
              <div style={{ color: "var(--op-ink-3)", fontSize: 12 }}>You are asking for</div>
              <strong>{FRAME_CORRECTION.officeName}</strong>
              <div>9:30 am to 6:00 pm</div>
              <div style={{ fontSize: 13 }}>Counts as 1 day</div>
            </div>
          </div>
          <p style={{ borderLeft: "3px solid var(--op-line-strong)", paddingLeft: 12 }}>{FRAME_CORRECTION.reason}</p>
          <div style={{ background: "var(--op-surface)", borderRadius: 16, padding: 16, border: "1px solid var(--op-line)" }}>
            <strong>If approved, October becomes</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <div className="op-days-track" style={{ flex: 1 }}>
                <div className="op-days-fill" style={{ width: "75%" }} />
              </div>
              <strong>6 / 8</strong>
            </div>
            <p style={{ color: "var(--op-ink-3)", fontSize: 13, marginBottom: 0 }}>Until then your month stays at 5 / 8 days.</p>
          </div>
          <button style={{ width: "100%", marginTop: 20, height: 48, borderRadius: 999, background: "var(--op-accent)", border: "none", fontWeight: 600 }}>
            Send request
          </button>
          <p style={{ textAlign: "center", color: "var(--op-accent)", textDecoration: "underline" }}>Edit request</p>
        </>
      )}
      {step === "sent" && (
        <>
          <h1 style={{ fontSize: 28 }}>Request sent</h1>
          <p style={{ color: "var(--op-ink-2)" }}>An admin will review it. Your month stays at 5 / 8 until they approve.</p>
          <button style={{ width: "100%", height: 48, borderRadius: 999, background: "var(--op-accent)", border: "none", fontWeight: 600 }}>
            Back to month
          </button>
        </>
      )}
    </div>
  );
}

function YouCorrectionsFrame() {
  return (
    <PhoneChrome tab="You">
      <h1 style={{ fontSize: 28 }}>{"< Correction requests"}</h1>
      <p style={{ color: "var(--op-ink-2)" }}>{FRAME_CORRECTION_REQUESTS.closeDate}</p>
      <h3>Open</h3>
      <div style={{ background: "var(--op-surface)", borderRadius: 20, padding: 4, border: "1px solid var(--op-line)" }}>
        {FRAME_CORRECTION_REQUESTS.open.map((r) => (
          <div key={r.dayKey} style={{ display: "flex", justifyContent: "space-between", padding: 14 }}>
            <div>
              <strong>{r.label}</strong>
              <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>{r.detail}</div>
            </div>
            <span className="op-badge accent">Pending review</span>
          </div>
        ))}
      </div>
      <h3>Decided</h3>
      <div style={{ background: "var(--op-surface)", borderRadius: 20, padding: 4, border: "1px solid var(--op-line)" }}>
        {FRAME_CORRECTION_REQUESTS.decided.map((r) => (
          <div key={r.dayKey} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderTop: "1px solid var(--op-line)" }}>
            <div>
              <strong>{r.label}</strong>
              <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>{r.detail}</div>
            </div>
            <span className="op-badge">
              {r.status === "approved" ? "Approved" : r.status === "rejected" ? "Not approved" : "Cancelled"}
            </span>
          </div>
        ))}
      </div>
    </PhoneChrome>
  );
}

function ColleaguesFrame({ variant }: { variant: "list" | "opted-out" | "empty" }) {
  return (
    <PhoneChrome tab="Colleagues">
      <h1 style={{ fontSize: 28 }}>Colleagues</h1>
      {variant === "opted-out" ? (
        <p style={{ color: "var(--op-ink-2)" }}>Sharing is off. Turn it on in Settings to see colleagues who also share.</p>
      ) : null}
      {variant === "empty" ? <p style={{ color: "var(--op-ink-2)" }}>Nobody in the office right now.</p> : null}
      {variant === "list" ? (
        <>
          <h3>In office now (2)</h3>
          {FRAME_COLLEAGUES.filter((c) => c.inOffice).map((c) => (
            <ColleagueRow key={c.id} name={c.name} office={c.officeName} since={c.sinceAt} inOffice />
          ))}
          <h3>Out</h3>
          {FRAME_COLLEAGUES.filter((c) => !c.inOffice).map((c) => (
            <ColleagueRow key={c.id} name={c.name} office={c.officeName} since={c.sinceAt} inOffice={false} />
          ))}
        </>
      ) : null}
    </PhoneChrome>
  );
}

function YouSettingsFrame() {
  const rows1 = [
    ["Share my status", "On"],
    ["Tracking", "On, synced 1 min ago"],
    ["Devices", "2 phones"],
    ["Correction requests", "1 pending"],
  ];
  const rows2 = [
    ["Office nicknames", ""],
    ["Suggest an office", ""],
    ["Rules", "Read only"],
    ["Theme", "System"],
    ["Notifications", "On"],
  ];
  return (
    <PhoneChrome tab="You">
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--op-sunk)", display: "grid", placeItems: "center", fontWeight: 700 }}>
          {FRAME_PERSON.initials}
        </div>
        <div>
          <strong style={{ fontSize: 20 }}>{FRAME_PERSON.name}</strong>
          <div style={{ color: "var(--op-ink-2)" }}>{FRAME_PERSON.email}</div>
        </div>
      </div>
      <CardRows rows={rows1} />
      <div style={{ height: 12 }} />
      <CardRows rows={rows2} />
      <div style={{ height: 12 }} />
      <div style={{ background: "var(--op-surface)", borderRadius: 20, padding: 16, border: "1px solid var(--op-line)", display: "flex", justifyContent: "space-between" }}>
        <span>Admin console</span>
        <span className="op-badge">Admin</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, alignItems: "center" }}>
        <span style={{ color: "var(--op-ink-3)", fontSize: 13 }}>Version 2.0.0</span>
        <button style={{ borderRadius: 999, border: "1px solid var(--op-accent)", color: "var(--op-accent)", background: "var(--op-surface)", padding: "10px 18px" }}>
          Sign out
        </button>
      </div>
    </PhoneChrome>
  );
}

function CardRows({ rows }: { rows: string[][] }) {
  return (
    <div style={{ background: "var(--op-surface)", borderRadius: 20, border: "1px solid var(--op-line)" }}>
      {rows.map(([l, r], i) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: 16, borderTop: i ? "1px solid var(--op-line)" : "none" }}>
          <span>{l}</span>
          <span style={{ color: "var(--op-ink-2)" }}>{r} ›</span>
        </div>
      ))}
    </div>
  );
}

function YouDevicesFrame() {
  return (
    <PhoneChrome tab="You">
      <h1 style={{ fontSize: 28 }}>{"< Devices"}</h1>
      <p style={{ color: "var(--op-ink-2)" }}>You can be signed in on several phones. The latest location wins, and a day counts once.</p>
      <div style={{ background: "var(--op-surface)", borderRadius: 20, border: "1px solid var(--op-line)" }}>
        {FRAME_DEVICES.map((d, i) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: 16, borderTop: i ? "1px solid var(--op-line)" : "none", alignItems: "center" }}>
            <div>
              <strong>{d.label}</strong>
              <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>{d.lastSeenLabel}</div>
            </div>
            {d.thisPhone ? <span className="op-badge">This phone</span> : <button style={{ borderRadius: 999, border: "1px solid var(--op-line-strong)", background: "transparent", padding: "8px 12px" }}>Sign out device</button>}
          </div>
        ))}
      </div>
      <div style={{ background: "var(--op-surface)", borderRadius: 20, border: "1px solid var(--op-line)", marginTop: 16, padding: 16 }}>
        <strong>This phone</strong>
        {[
          ["Location", "All the time"],
          ["Battery", "Unrestricted"],
          ["Last sync", "12:13 pm"],
        ].map(([l, r]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--op-line)" }}>
            <span style={{ color: "var(--op-ink-2)" }}>{l}</span>
            <strong>{r}</strong>
          </div>
        ))}
        <button style={{ width: "100%", height: 44, borderRadius: 999, background: "var(--op-accent)", border: "none", fontWeight: 600, marginTop: 8 }}>Sync now</button>
        <button style={{ width: "100%", height: 44, borderRadius: 999, border: "1px solid var(--op-line-strong)", background: "transparent", marginTop: 8 }}>Check now</button>
      </div>
    </PhoneChrome>
  );
}

function WebMonthFrame({ drawer }: { drawer: null | "day" | "correction" }) {
  return (
    <WebShell active="My month">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>{"< October 2026 >"}</h1>
        <span style={{ color: "var(--op-ink-3)" }}>Times in Asia/Kolkata</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
        <div>
          <div style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)", marginBottom: 16 }}>
            <StatusHero inOffice officeName={FRAME_TODAY.officeName} sinceLabel={FRAME_TODAY.sinceLabel} />
          </div>
          <div style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)" }}>
            <DaysMeter current={5} target={8} />
            <p style={{ color: "var(--op-ink-3)" }}>4 visits so far.</p>
            <HoursFyiRow hours={2.53} advised={5} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {Array.from({ length: 31 }, (_, i) => {
            const day = i + 1;
            const hit = FRAME_MONTH_DAYS.find((d) => Number(d.dayKey.slice(8)) === day);
            return (
              <div
                key={day}
                style={{
                  minHeight: 72,
                  borderRadius: 12,
                  background: "var(--op-surface)",
                  border: hit ? "1px solid var(--op-accent)" : day === 27 ? "2px solid #5C2E1A" : "1px solid var(--op-line)",
                  padding: 8,
                }}
              >
                <div style={{ fontSize: 12 }}>{day}</div>
                {hit ? (
                  <>
                    <span className="op-badge accent">{hit.label}</span>
                    <div style={{ fontSize: 11, color: "var(--op-ink-2)" }}>{hit.officeName}</div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {drawer && (
        <div style={{ position: "fixed", inset: 0, background: "var(--op-scrim)", display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: 420, background: "var(--op-surface)", padding: 24, height: "100%" }}>
            <h2>{drawer === "day" ? "Thu 15 Oct" : "Request a correction"}</h2>
            {drawer === "day" ? (
              <>
                <p>No visit recorded.</p>
                <button style={{ width: "100%", height: 44, borderRadius: 999, background: "var(--op-accent)", border: "none" }}>Request a correction</button>
              </>
            ) : (
              <>
                <p>Issue: A visit is missing</p>
                <p>{FRAME_CORRECTION.officeName}, 9:30 to 18:00</p>
                <button style={{ width: "100%", height: 44, borderRadius: 999, background: "var(--op-accent)", border: "none" }}>Send request</button>
              </>
            )}
          </div>
        </div>
      )}
    </WebShell>
  );
}

function WebColleaguesFrame() {
  return (
    <WebShell active="Colleagues">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Colleagues</h1>
        <span style={{ fontSize: 13 }}>
          You are sharing your status · <span style={{ color: "var(--op-accent)", textDecoration: "underline" }}>Manage sharing</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, margin: "16px 0" }}>
        <input placeholder="Search name" style={{ flex: 1, padding: 10, borderRadius: 999, border: "1px solid var(--op-line)" }} />
        <div style={{ display: "flex", background: "var(--op-sunk)", borderRadius: 999, padding: 4 }}>
          {["All", "In", "Out"].map((t, i) => (
            <span key={t} style={{ padding: "6px 14px", borderRadius: 999, background: i === 0 ? "var(--op-ink)" : "transparent", color: i === 0 ? "var(--op-bg)" : "var(--op-ink-2)", fontSize: 13 }}>
              {t}
            </span>
          ))}
        </div>
        <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "var(--op-surface)", padding: "8px 14px" }}>All offices ›</button>
      </div>
      <div style={{ background: "var(--op-surface)", borderRadius: 16, border: "1px solid var(--op-line)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr", padding: 12, color: "var(--op-ink-3)", fontSize: 13 }}>
          <div>Name</div><div>Status</div><div>Since</div><div>Office</div>
        </div>
        {FRAME_COLLEAGUES.map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr", padding: 14, borderTop: "1px solid var(--op-line)", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: "var(--op-accent-wash)", color: "var(--op-accent)", display: "grid", placeItems: "center", fontWeight: 700 }}>{c.initials}</div>
              <strong>{c.name}</strong>
            </div>
            <StatusBadge inOffice={c.inOffice} />
            <div>{c.sinceAt}</div>
            <div>{c.officeName}</div>
          </div>
        ))}
      </div>
    </WebShell>
  );
}

function WebSettingsFrame() {
  return (
    <WebShell active="Settings">
      <h1>Settings</h1>
      <section style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <strong>Share my status</strong>
            <p style={{ color: "var(--op-ink-2)", margin: "4px 0 0" }}>Turn off at any time. Colleagues stop seeing you right away.</p>
          </div>
          <div style={{ width: 48, height: 28, borderRadius: 999, background: "var(--op-accent)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <div style={{ background: "var(--op-sunk)", borderRadius: 12, padding: 12 }}>
            <strong>Colleagues see</strong>
            <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>In or Out, since when, office name.</div>
          </div>
          <div style={{ background: "var(--op-sunk)", borderRadius: 12, padding: 12 }}>
            <strong>Never shared</strong>
            <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>Live GPS, coordinates, hours, days counted.</div>
          </div>
        </div>
      </section>
      <section style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)", marginBottom: 16 }}>
        <strong>Devices</strong>
        {FRAME_DEVICES.map((d) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--op-line)" }}>
            <div>
              <strong>{d.label}</strong>
              <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>{d.lastSeenLabel}</div>
            </div>
            <button style={{ borderRadius: 999, border: "1px solid var(--op-line-strong)", background: "transparent", padding: "8px 12px" }}>Sign out device</button>
          </div>
        ))}
      </section>
      <section style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)", marginBottom: 16 }}>
        <strong>Office nicknames</strong>
        {FRAME_OFFICES.slice(0, 2).map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <span style={{ flex: 1 }}>{o.name}</span>
            <input defaultValue={o.id === "off-ggn" ? "Tower B" : ""} placeholder="Add a nickname" style={{ flex: 1, padding: 10, borderRadius: 12, border: "1px solid var(--op-line)" }} />
          </div>
        ))}
      </section>
      <section style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)", marginBottom: 16 }}>
        <strong>Appearance</strong>
        <div style={{ display: "inline-flex", background: "var(--op-sunk)", borderRadius: 999, padding: 4, marginTop: 8 }}>
          {["System", "Light", "Dark"].map((t, i) => (
            <span key={t} style={{ padding: "6px 14px", borderRadius: 999, background: i === 0 ? "var(--op-ink)" : "transparent", color: i === 0 ? "var(--op-bg)" : "var(--op-ink)" }}>{t}</span>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <div>
            <strong>Notifications</strong>
            <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>When you arrive and when the month target is met.</div>
          </div>
          <div style={{ width: 48, height: 28, borderRadius: 999, background: "var(--op-accent)" }} />
        </div>
      </section>
      <section style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)" }}>
        <strong>Suggest an office</strong>
        <p style={{ color: "var(--op-ink-2)" }}>An admin reviews it before it counts.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input placeholder="Office name" style={{ padding: 10, borderRadius: 12, border: "1px solid var(--op-line)" }} />
          <input placeholder="Address" style={{ padding: 10, borderRadius: 12, border: "1px solid var(--op-line)" }} />
        </div>
        <button style={{ marginTop: 12, borderRadius: 999, background: "var(--op-accent)", border: "none", padding: "10px 18px", fontWeight: 600 }}>Suggest office</button>
      </section>
    </WebShell>
  );
}

function WebRosterFrame({ variant }: { variant: "ready" | "loading" | "empty" | "error" }) {
  return (
    <WebShell active="Roster" admin>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Roster</h1>
        <span style={{ color: "var(--op-ink-3)" }}>Updated 12 s ago</span>
      </div>
      {variant === "error" ? <p className="status-msg error">Could not load roster.</p> : null}
      {variant === "loading" ? <div style={{ height: 120, background: "var(--op-sunk)", borderRadius: 16, marginTop: 16 }} /> : null}
      {variant !== "loading" && variant !== "error" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "16px 0" }}>
            {[
              [`${FRAME_ROSTER_STATS.inNow}`, "In now"],
              [`${FRAME_ROSTER_STATS.out}`, "Out"],
              [`${FRAME_ROSTER_STATS.belowTarget}`, "Below target"],
              [`${FRAME_ROSTER_STATS.goalMet}`, "Goal met"],
            ].map(([n, l], i) => (
              <div key={l} style={{ background: "var(--op-surface)", borderRadius: 16, padding: 16, border: "1px solid var(--op-line)", borderTop: i === 2 ? "3px solid var(--op-accent)" : undefined }}>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div>
                <div style={{ color: "var(--op-ink-2)" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="Search name or email" style={{ flex: 1, padding: 10, borderRadius: 999, border: "1px solid var(--op-line)" }} />
            <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "var(--op-surface)", padding: "8px 14px" }}>All offices ›</button>
            <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "var(--op-surface)", padding: "8px 14px" }}>Export CSV</button>
          </div>
          <div style={{ background: "var(--op-surface)", borderRadius: 16, border: "1px solid var(--op-line)" }}>
            {variant === "empty" ? (
              <p style={{ padding: 24, color: "var(--op-ink-2)" }}>No people yet.</p>
            ) : (
              FRAME_ROSTER_ROWS.map((u) => (
                <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.4fr 1.2fr 1fr 1fr 1fr", padding: 14, borderTop: "1px solid var(--op-line)", alignItems: "center", fontSize: 14 }}>
                  <div>
                    <strong>{u.name}</strong>
                    <div style={{ color: "var(--op-ink-3)" }}>{u.email}</div>
                  </div>
                  <div>
                    {u.noRecentSync ? <span className="op-badge accent">No recent sync</span> : <StatusBadge inOffice={u.inOffice} />}
                    <div style={{ color: "var(--op-ink-3)", fontSize: 12 }}>{u.sinceLabel}</div>
                  </div>
                  <div>{u.officeName}</div>
                  <div>
                    <div className="op-days-track"><div className="op-days-fill" style={{ width: `${(u.monthPoints / 8) * 100}%` }} /></div>
                    {u.monthPoints} / 8
                  </div>
                  <div>{u.hoursToday.toFixed(1)} h</div>
                  <div>{u.lastDeviceName}</div>
                  <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "transparent", padding: "6px 10px" }}>View visits</button>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </WebShell>
  );
}

function WebCorrectionsFrame({ variant }: { variant: "list" | "review" | "reject" | "empty" }) {
  return (
    <WebShell active="Corrections" admin>
      <h1 style={{ marginTop: 0 }}>Corrections</h1>
      <p style={{ color: "var(--op-ink-2)" }}>Employee requests to change a day. Totals change only when you approve.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        {[["5", "Pending review"], ["23", "Approved in October"], ["4", "Not approved in October"]].map(([n, l], i) => (
          <div key={l} style={{ background: "var(--op-surface)", borderRadius: 16, padding: 16, border: "1px solid var(--op-line)", borderBottom: i === 0 ? "3px solid var(--op-accent)" : undefined }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div>
            <div style={{ color: "var(--op-ink-2)" }}>{l}</div>
          </div>
        ))}
      </div>
      {variant === "empty" ? (
        <div style={{ background: "var(--op-surface)", borderRadius: 16, padding: 40, textAlign: "center", color: "var(--op-ink-2)" }}>No pending corrections.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: variant === "list" ? "1fr" : "1fr 420px", gap: 16 }}>
          <div style={{ background: "var(--op-surface)", borderRadius: 16, border: "1px solid var(--op-line)" }}>
            {FRAME_CORRECTIONS_QUEUE.map((r, i) => (
              <div key={r.id} style={{ padding: 14, borderTop: i ? "1px solid var(--op-line)" : "none", background: i === 0 && variant !== "list" ? "var(--op-accent-wash)" : "transparent" }}>
                <strong>{r.person}</strong> · {r.dayLabel} · {r.issue}
                <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>Recorded: {r.recorded} · Requested: {r.requested}</div>
              </div>
            ))}
          </div>
          {variant !== "list" ? (
            <div style={{ background: "var(--op-surface)", borderRadius: 16, border: "1px solid var(--op-line)", padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>Correction request</h2>
              <span className="op-badge accent">Pending review</span>
              <h3>Thu 15 Oct: a visit is missing.</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: 12, background: "var(--op-sunk)", borderRadius: 12 }}>Recorded: No visit</div>
                <div style={{ padding: 12, background: "var(--op-accent-wash)", borderRadius: 12 }}>Requested: Gurugram, Tower B, 9:30 am to 6:00 pm</div>
              </div>
              <p>{FRAME_CORRECTION.reason}</p>
              <p style={{ color: "var(--op-ink-3)", fontSize: 13 }}>Phone data: Pixel 8 last sync 8:55 am · Galaxy S23 no samples that day</p>
              <p>Effect on October: 5/8 → 6/8</p>
              {variant === "reject" ? (
                <input placeholder="Why not approved" style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--op-line)", marginBottom: 12 }} />
              ) : null}
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, height: 44, borderRadius: 999, background: "var(--op-accent)", border: "none", fontWeight: 600 }}>Approve</button>
                <button style={{ flex: 1, height: 44, borderRadius: 999, border: "1px solid var(--op-line-strong)", background: "transparent" }}>Reject</button>
              </div>
              <p style={{ color: "var(--op-ink-3)", fontSize: 12 }}>You cannot decide your own requests.</p>
            </div>
          ) : null}
        </div>
      )}
    </WebShell>
  );
}

function WebOfficesFrame() {
  return (
    <WebShell active="Offices" admin>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Offices</h1>
          <p style={{ color: "var(--op-ink-2)" }}>6 offices, 2 suggestions to review.</p>
        </div>
        <button style={{ borderRadius: 999, background: "var(--op-accent)", border: "none", padding: "10px 18px", fontWeight: 600, height: 44 }}>Add office</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          {FRAME_OFFICES.map((o, i) => (
            <div key={o.id} style={{ background: "var(--op-surface)", borderRadius: 16, padding: 16, border: i === 0 ? "2px solid var(--op-ink)" : "1px solid var(--op-line)", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{o.name}</strong>
                <span className="op-badge in">{o.inNow} In</span>
              </div>
              <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>{o.addressLabel}</div>
              <div style={{ fontSize: 13 }}>Radius {o.radiusMeters} m · Counts as {o.pointsPerVisitDay} day{o.pointsPerVisitDay === 1 ? "" : "s"}</div>
              {i === 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                  <input defaultValue={100} style={{ padding: 10, borderRadius: 12, border: "1px solid var(--op-line)" }} />
                  <input defaultValue={1} style={{ padding: 10, borderRadius: 12, border: "1px solid var(--op-line)" }} />
                  <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "transparent", padding: 10 }}>Delete office</button>
                  <button style={{ borderRadius: 999, background: "var(--op-accent)", border: "none", padding: 10, fontWeight: 600 }}>Save office</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div style={{ background: "var(--op-sunk)", borderRadius: 16, minHeight: 480, position: "relative", padding: 16 }}>
          <input placeholder="Search an address" style={{ width: "60%", padding: 10, borderRadius: 999, border: "1px solid var(--op-line)" }} />
          <div style={{ position: "absolute", inset: "40% 40%", width: 120, height: 120, borderRadius: 999, background: "var(--op-accent-wash)", border: "2px solid var(--op-accent)" }} />
          <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, color: "var(--op-ink-3)", fontSize: 13 }}>
            Drag the pin or the circle edge to adjust. Changes apply when you save.
          </div>
        </div>
      </div>
    </WebShell>
  );
}

function WebReportsFrame() {
  return (
    <WebShell active="Reports" admin>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Reports</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "var(--op-surface)", padding: "8px 14px" }}>October 2026 ›</button>
          <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "var(--op-surface)", padding: "8px 14px" }}>All offices ›</button>
          <button style={{ borderRadius: 999, background: "var(--op-accent)", border: "none", padding: "8px 14px", fontWeight: 600 }}>Export CSV</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "16px 0", background: "var(--op-surface)", borderRadius: 16, padding: 16, border: "1px solid var(--op-line)" }}>
        {[["312", "People"], ["118", "Goal met"], ["194", "Below target"], ["8", "Target days"]].map(([n, l]) => (
          <div key={l}><div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div><div style={{ color: "var(--op-ink-2)" }}>{l}</div></div>
        ))}
      </div>
      <div style={{ background: "var(--op-surface)", borderRadius: 16, border: "1px solid var(--op-line)" }}>
        {FRAME_ROSTER_ROWS.map((u) => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1.5fr 1fr 1fr 1fr", padding: 14, borderTop: "1px solid var(--op-line)" }}>
            <strong>{u.name}</strong>
            <div>{u.officeName}</div>
            <div>{u.monthPoints}</div>
            <div>{u.monthPoints} / 8</div>
            <div>{u.monthPoints >= 8 ? <span className="op-badge goal">Goal met</span> : `${8 - u.monthPoints} to go`}</div>
            <div>71 h</div>
            <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "transparent" }}>View visits</button>
          </div>
        ))}
      </div>
    </WebShell>
  );
}

function WebRulesFrame() {
  const rows = [
    ["Monthly target", "Office days needed each month", "8 days"],
    ["Counts as", "Days per visit day, set per office", "Edit in Offices"],
    ["A visit ends after a gap of", "No samples inside the office", "15 minutes"],
    ["Location sample", "Set by the app", "About every 5 minutes"],
    ["Default office radius", "Used for new offices", "100 m"],
    ["Suggested day", "Advice only, never affects days", "5 hours"],
    ["Correction requests close", "After this the month is locked", "5 days after month end"],
    ["Who decides corrections", "Every decision is logged", "Any admin, except on their own requests"],
    ["Default timezone", "Used to decide which day a visit falls on", "Asia/Kolkata"],
  ];
  return (
    <WebShell active="Rules" admin>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Rules</h1>
          <p style={{ color: "var(--op-ink-2)" }}>Apply to everyone. Phones show them read-only.</p>
        </div>
        <button style={{ borderRadius: 999, background: "var(--op-accent)", border: "none", padding: "10px 18px", fontWeight: 600, height: 44 }}>Save rules</button>
      </div>
      <div style={{ background: "var(--op-surface)", borderRadius: 16, border: "1px solid var(--op-line)", marginTop: 16 }}>
        {rows.map(([l, d, v], i) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: 16, borderTop: i ? "1px solid var(--op-line)" : "none", alignItems: "center" }}>
            <div>
              <strong>{l}</strong>
              <div style={{ color: "var(--op-ink-2)", fontSize: 13 }}>{d}</div>
            </div>
            <div style={{ color: v.startsWith("Edit") ? "var(--op-accent)" : "var(--op-ink)", textDecoration: v.startsWith("Edit") ? "underline" : "none" }}>{v}</div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--op-ink-3)", fontSize: 13 }}>A day counts once, even when several phones report it. The latest location wins.</p>
    </WebShell>
  );
}

function WebPersonVisitsFrame() {
  return (
    <WebShell active="Roster" admin>
      <div style={{ color: "var(--op-ink-3)", marginBottom: 8 }}>Roster / Meera Das</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: "var(--op-sunk)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 22 }}>MD</div>
          <div>
            <h1 style={{ margin: 0 }}>Meera Das</h1>
            <div style={{ color: "var(--op-ink-2)" }}>meera.das@pwc.com, Kolkata, Plot Y14, 2 phones</div>
          </div>
        </div>
        <span className="op-badge out">Out since Fri 5:55 pm</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginTop: 20 }}>
        <div style={{ background: "var(--op-surface)", borderRadius: 16, padding: 20, border: "1px solid var(--op-line)" }}>
          <DaysMeter current={5} target={8} />
          <p style={{ color: "var(--op-ink-2)", fontSize: 13 }}>3 visits in October. 1 corrected, 1 pending review.</p>
          <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "transparent", padding: "8px 12px", marginRight: 8 }}>October 2026 ›</button>
          <button style={{ borderRadius: 999, border: "1px solid var(--op-line)", background: "transparent", padding: "8px 12px" }}>Export CSV</button>
        </div>
        <div style={{ background: "var(--op-surface)", borderRadius: 16, border: "1px solid var(--op-line)" }}>
          {[
            ["Fri 23 Oct", "Kolkata, Plot Y14", "9:20 am", "5:55 pm", "8 h 35 m", "2 days", "Pixel 7a", ""],
            ["Tue 13 Oct", "Gurugram, Cyber City", "11:02 am", "2:15 pm", "3 h 13 m", "1 day", "Galaxy S23", "Pending review"],
            ["Tue 13 Oct", "Gurugram, Cyber City", "2:50 pm", "4:05 pm", "1 h 15 m", "Same day", "Pixel 7a", ""],
            ["Mon 5 Oct", "Kolkata, Plot Y14", "9:30 am", "6:00 pm", "8 h 30 m", "2 days", "By request, Kavya Rao, 7 Oct", "Corrected"],
          ].map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 1.4fr", padding: 12, borderTop: i ? "1px solid var(--op-line)" : "none", fontSize: 13 }}>
              <div>
                <strong>{row[0]}</strong>
                {row[7] ? <div><span className="op-badge accent">{row[7]}</span></div> : null}
              </div>
              <div>{row[1]}</div><div>{row[2]}</div><div>{row[3]}</div><div>{row[4]}</div><div><strong>{row[5]}</strong></div><div>{row[6]}</div>
            </div>
          ))}
        </div>
      </div>
    </WebShell>
  );
}
