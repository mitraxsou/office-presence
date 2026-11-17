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
 * Points an admin, correction, or Office Tracker visit counts as: the award stored when the
 * visit was written. Stored 0 means the admin turned the day off. Later office edits do not
 * change it.
 */
export function adminVisitPoints(stored: number): number {
  const storedPoints = Math.round(Number.isFinite(stored) ? stored : 0);
  return Math.max(0, storedPoints);
}

/** Visit days are information only (SPEC §20). */
export function visitDaysFyi(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v === 1 ? "1 visit day" : `${v} visit days`;
}
