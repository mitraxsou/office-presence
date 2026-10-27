import styles from "./StatusBadge.module.css";

export type BadgeKind = "in" | "out" | "goalMet" | "noRecentSync" | "pending" | "approved" | "notApproved" | "cancelled";

const LABEL: Record<BadgeKind, string> = {
  in: "In", out: "Out", goalMet: "Goal met", noRecentSync: "No recent sync",
  pending: "Pending review", approved: "Approved", notApproved: "Not approved", cancelled: "Cancelled",
};
const DOT: Partial<Record<BadgeKind, true>> = { in: true, out: true, noRecentSync: true, pending: true };
const CHECK: Partial<Record<BadgeKind, true>> = { goalMet: true, approved: true };

export function StatusBadge({ kind, small = true, compact = false }: { kind: BadgeKind; small?: boolean; compact?: boolean }) {
  const text = compact && kind === "goalMet" ? "Met" : LABEL[kind];
  return (
    <span className={`${styles.badge} ${styles[kind]} ${small ? styles.small : ""}`}>
      {DOT[kind] && <span className={styles.dot} aria-hidden />}
      {CHECK[kind] && (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
      {text}
    </span>
  );
}

export function FyiTag() {
  return <span className={styles.fyi}>FYI</span>;
}

export function CorrectedTag() {
  return <span className={`${styles.fyi} ${styles.corrected}`}>Corrected</span>;
}
