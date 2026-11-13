/** UI helpers for monthly points. API fields already use points. */

export function formatPoints(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${v} / `;
}

export function pointsMeterLabel(current: number, target: number): {
  main: string;
  side: string;
  met: boolean;
} {
  const c = Math.max(0, Math.round(current));
  const t = Math.max(1, Math.round(target));
  const met = c >= t;
  return {
    main: `${c} / ${t} points`,
    side: met ? "Goal met" : `${Math.max(0, t - c)} to go`,
    met,
  };
}

export function countsAs(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v === 1 ? "Counts as 1 point" : `Counts as ${v} points`;
}

export function pointsCounted(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v === 1 ? "1 point counted" : `${v} points counted`;
}

/** Text in the Counts as column: "1 point" or "N points". */
export function pointsCellLabel(n: number): string {
  const v = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  return v === 1 ? "1 point" : `${v} points`;
}

/**
 * Points an admin visit counts as.
 * Stored 0 means the admin turned the day off.
 * A positive stored award uses the office weight when that office is known,
 * so a stored 1 does not override the office.
 */
export function adminVisitPoints(stored: number, officePoints: number | null | undefined): number {
  const storedPoints = Math.round(Number.isFinite(stored) ? stored : 0);
  if (storedPoints <= 0) return 0;
  if (officePoints == null || !Number.isFinite(officePoints)) return storedPoints;
  return Math.max(0, Math.round(officePoints));
}

/** Visit days are information only (SPEC §20). */
export function visitDaysFyi(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v === 1 ? "1 visit day" : `${v} visit days`;
}
