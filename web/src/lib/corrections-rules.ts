export function isMonthLocked(dayKey: string, windowDays: number, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return true;
  const [y, m] = dayKey.split("-").map(Number);
  const lockAt = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  lockAt.setUTCDate(lockAt.getUTCDate() + windowDays);
  return now.getTime() > lockAt.getTime();
}

/** Sole active admin may decide their own correction requests. */
export function canDecideOwnCorrection(activeAdminCount: number): boolean {
  return activeAdminCount === 1;
}
