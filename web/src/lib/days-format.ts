/** UI helpers: API still uses points; screens never say "points". */

export function formatDays(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${v} / `;
}

export function daysMeterLabel(current: number, target: number): { main: string; side: string; met: boolean } {
  const c = Math.max(0, Math.round(current));
  const t = Math.max(1, Math.round(target));
  const met = c >= t;
  return {
    main: `${c} / ${t} days`,
    side: met ? "Goal met" : `${Math.max(0, t - c)} to go`,
    met,
  };
}

export function countsAs(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v === 1 ? "Counts as 1 day" : `Counts as ${v} days`;
}

export function daysCounted(n: number): string {
  const v = Math.max(0, Math.round(n));
  return v === 1 ? "1 day counted" : `${v} days counted`;
}
