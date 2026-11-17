/** Rules for which channel a personal alert uses, and when Teams may send it. */

export const ACTIVE_PHONE_MS = 7 * 24 * 3600_000;

/** A phone counts as active when it is not revoked and was seen in the last 7 days. */
export function hasActivePhone(
  devices: { revokedAt: Date | null; lastSeenAt: Date | null }[],
  nowMs = Date.now(),
): boolean {
  return devices.some(
    (d) => d.revokedAt == null && d.lastSeenAt != null && nowMs - d.lastSeenAt.getTime() <= ACTIVE_PHONE_MS,
  );
}

export type LocalParts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

/** Local calendar parts in [timezone]. weekday is 1 (Monday) to 7 (Sunday). */
export function localParts(date: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdays.indexOf(parts.weekday) + 1,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** ISO 8601 week key for the local date, e.g. "2026-W47". */
export function isoWeekKey(date: Date, timezone: string): string {
  const p = localParts(date, timezone);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = p.weekday;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday from 09:00 local time. */
export function isWeeklySummaryWindow(date: Date, timezone: string): boolean {
  const p = localParts(date, timezone);
  return p.weekday === 1 && p.hour >= 9;
}

export type QuietPrefs = {
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  quietHoursDays?: string | null;
  quietHoursCustomDays?: string | null;
};

function minutesOf(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function dayApplies(prefs: QuietPrefs, weekday: number): boolean {
  const mode = prefs.quietHoursDays ?? "all";
  if (mode === "weekdays") return weekday <= 5;
  if (mode === "custom") {
    const days = (prefs.quietHoursCustomDays ?? "1,2,3,4,5").split(",").map((s) => Number(s.trim()));
    return days.includes(weekday);
  }
  return true;
}

/** True when [date] falls inside the person's quiet hours. A window past midnight belongs to the day it starts. */
export function inQuietHours(prefs: QuietPrefs | null | undefined, date: Date, timezone: string): boolean {
  if (!prefs?.quietHoursStart || !prefs.quietHoursEnd) return false;
  const start = minutesOf(prefs.quietHoursStart);
  const end = minutesOf(prefs.quietHoursEnd);
  if (start == null || end == null || start === end) return false;
  const p = localParts(date, timezone);
  const now = p.hour * 60 + p.minute;
  if (start < end) {
    return now >= start && now < end && dayApplies(prefs, p.weekday);
  }
  if (now >= start) return dayApplies(prefs, p.weekday);
  if (now < end) return dayApplies(prefs, p.weekday === 1 ? 7 : p.weekday - 1);
  return false;
}
