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

/** Visit days are information only (SPEC §20). */
export function visitDaysFyi(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v === 1 ? "1 visit day" : `${v} visit days`;
}
