"use client";

import { countsAs } from "@/lib/days-format";

/** Shared web components. Screens compose these; they should not restyle them. */

export function StatusHero({
  inOffice,
  officeName,
  sinceLabel,
}: {
  inOffice: boolean;
  officeName?: string | null;
  sinceLabel?: string | null;
}) {
  return (
    <div className="op-status-hero">
      <div className="op-status-row-web">
        <span className="op-status-word-web">{inOffice ? "In" : "Out"}</span>
        <span className={`op-status-dot ${inOffice ? "in" : "out"}`} aria-hidden />
      </div>
      <div className="op-status-office">{inOffice ? officeName || "Office" : "Not at an office"}</div>
      {sinceLabel ? <div className="op-status-since">{sinceLabel}</div> : null}
    </div>
  );
}

export function DaysMeter({
  current,
  target,
  size = "lg",
  caption,
}: {
  current: number;
  target: number;
  size?: "lg" | "md" | "inline";
  caption?: string;
}) {
  const c = Math.max(0, Math.round(current));
  const t = Math.max(1, Math.round(target));
  const met = c >= t;
  const pct = Math.min(100, Math.round((c / t) * 100));
  const label = `${c} of ${t} days, ${met ? "goal met" : `${t - c} to go`}`;

  if (size === "inline") {
    return (
      <div className="op-days-inline" aria-label={label}>
        <div className="op-days-track" style={{ width: 64, height: 6, marginTop: 0 }} aria-hidden>
          <div className="op-days-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="op-days-inline-value">
          {c} / {t}
        </span>
        {met ? <StatusBadge kind="goalMet" compact /> : null}
      </div>
    );
  }

  return (
    <div className={`op-days-meter ${size === "md" ? "op-days-md" : ""}`} role="img" aria-label={label}>
      <div className="op-days-row">
        <div>
          <span className="op-days-num">{c}</span>
          <span className="op-days-den">/ {t} days</span>
        </div>
        {met ? <StatusBadge kind="goalMet" /> : <span className="op-days-togo">{t - c} to go</span>}
      </div>
      <div className="op-days-track" aria-hidden>
        <div className="op-days-fill" style={{ width: `${pct}%` }} />
      </div>
      {caption ? <p className="help" style={{ marginTop: 10 }}>{caption}</p> : null}
    </div>
  );
}

export function HoursFyiRow({
  hours,
  advised,
  value,
  caption = "Suggested 5 h a day. Does not affect days.",
}: {
  hours?: number;
  advised?: number;
  value?: string;
  caption?: string;
}) {
  const display = value ?? (typeof hours === "number" ? `${hours.toFixed(1)} h` : "0 h");
  const cap =
    typeof advised === "number" ? `Suggested ${advised} h a day. Does not affect days.` : caption;
  return (
    <div className="op-hours-fyi">
      <div>
        <div>
          <span className="op-label">Hours today</span> <FyiTag />
        </div>
        <div className="help">{cap}</div>
      </div>
      <div className="op-hours-value">{display}</div>
    </div>
  );
}

export type BadgeKind =
  | "in"
  | "out"
  | "goalMet"
  | "noRecentSync"
  | "pending"
  | "approved"
  | "notApproved"
  | "cancelled";

const BADGE_LABEL: Record<BadgeKind, string> = {
  in: "In",
  out: "Out",
  goalMet: "Goal met",
  noRecentSync: "No recent sync",
  pending: "Pending review",
  approved: "Approved",
  notApproved: "Not approved",
  cancelled: "Cancelled",
};

const BADGE_DOT: Partial<Record<BadgeKind, true>> = {
  in: true,
  out: true,
  noRecentSync: true,
  pending: true,
};

const BADGE_CHECK: Partial<Record<BadgeKind, true>> = {
  goalMet: true,
  approved: true,
};

export function StatusBadge({
  kind,
  inOffice,
  compact = false,
}: {
  kind?: BadgeKind;
  /** @deprecated Prefer kind="in" | "out" */
  inOffice?: boolean;
  compact?: boolean;
}) {
  const resolved: BadgeKind = kind ?? (inOffice ? "in" : "out");
  const text = compact && resolved === "goalMet" ? "Met" : BADGE_LABEL[resolved];
  const cls =
    resolved === "goalMet"
      ? "goal"
      : resolved === "noRecentSync" || resolved === "pending"
        ? "pending"
        : resolved === "approved"
          ? ""
          : resolved === "notApproved" || resolved === "cancelled"
            ? "out"
            : resolved;
  return (
    <span className={`op-badge ${cls}`.trim()}>
      {BADGE_DOT[resolved] ? <span className="op-badge-dot" aria-hidden /> : null}
      {BADGE_CHECK[resolved] ? (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {text}
    </span>
  );
}

export function FyiTag() {
  return <span className="op-badge fyi">FYI</span>;
}

export function CorrectedTag() {
  return <span className="op-badge corrected">Corrected</span>;
}

export function ColleagueRow({
  name,
  office,
  since,
  inOffice,
}: {
  name: string;
  office?: string | null;
  since?: string | null;
  inOffice: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="op-colleague">
      <div className="op-avatar" aria-hidden>
        {initial}
      </div>
      <div className="op-colleague-body">
        <div className="op-colleague-name">{name}</div>
        <div className="help">
          {inOffice
            ? `${office || "Office"}${since ? `, In since ${since}` : ""}`
            : office || "Out"}
        </div>
      </div>
      <StatusBadge kind={inOffice ? "in" : "out"} />
    </div>
  );
}

export function OfficeCountsAs({ n }: { n: number }) {
  return <span className="op-badge accent">{countsAs(n)}</span>;
}
