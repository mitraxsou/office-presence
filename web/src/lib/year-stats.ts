import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { listPointOffices, toFence } from "@/lib/offices";
import {
  computeDayPoints,
  dayKeyInTz,
  localDayBounds,
  DEFAULT_POINTS_TARGET,
  type ComputedVisit,
  type DayPointsResult,
} from "@/lib/visit-calculator";
import { monthKeyInTz } from "@/lib/presence";

const MONTH_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"] as const;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export type YearMonthRow = {
  month: string;
  label: string;
  points: number;
  visitDays: number;
  targetMet: boolean;
  isCurrent: boolean;
  isFuture: boolean;
};

export type YearOfficeRow = {
  officeLocationId: string | null;
  name: string;
  visitDays: number;
  points: number;
  pointsPerVisitDay: number;
};

export type YearWeekdayRow = {
  weekday: number;
  label: string;
  visitDays: number;
};

export type YearPayload = {
  year: number;
  generatedAt: string;
  timezone: string;
  pointsTarget: number;
  currentMonth: string;
  yearsWithData: number[];
  summary: {
    points: number;
    visitDays: number;
    monthsMet: number;
    monthsElapsed: number;
    targetSoFar: number;
    pointsThisMonth: number;
    toGoThisMonth: number;
    currentMonthLabel: string;
  };
  months: YearMonthRow[];
  offices: YearOfficeRow[];
  weekdays: YearWeekdayRow[];
  visitDayKeys: string[];
  usualArrival: string | null;
  usualLeaving: string | null;
  averageHoursPerVisitDay: number;
  multiOfficeDays: number;
  correctionRequests: number;
  correctionApproved: number;
  adminEditedDays: number;
};

function yearBounds(year: number, timezone: string) {
  const start = new Date(localDayBounds(`${year}-01-01`, timezone).startMs);
  const end = new Date(localDayBounds(`${year + 1}-01-01`, timezone).startMs);
  return { start, end };
}

function medianMinutes(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

function formatClock(mins: number): string {
  const d = new Date(Date.UTC(2000, 0, 1, 0, mins));
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return raw.toLowerCase().replace(/\u202f/g, " ");
}

function minutesOfDay(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + m;
}

/** ISO weekday Mon=1 .. Sun=7 */
function isoWeekday(dayKey: string, timezone: string): number {
  const [y, mo, d] = dayKey.split("-").map(Number);
  const noon = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(noon);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

function monthLabelLong(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

async function officeNameResolver(userId: string) {
  const [all, aliases] = await Promise.all([
    prisma.officeLocation.findMany({ select: { id: true, name: true, pointsPerVisitDay: true } }),
    prisma.userOfficeAlias.findMany({ where: { userId } }),
  ]);
  const names = new Map(all.map((o) => [o.id, o.name]));
  const points = new Map(all.map((o) => [o.id, o.pointsPerVisitDay ?? 1]));
  for (const a of aliases) names.set(a.officeLocationId, a.displayName);
  return {
    nameOf: (id: string | null | undefined) => (id ? names.get(id) ?? "Office" : "Office"),
    pointsOf: (id: string | null | undefined) => (id ? points.get(id) ?? 1 : 1),
  };
}

/** Month content version for sync: latest visit or correction touch in that month. */
export async function monthContentVersion(userId: string, monthKey: string, timezone: string): Promise<string> {
  const { start, end } = (() => {
    const [y, m] = monthKey.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return {
      start: new Date(localDayBounds(`${monthKey}-01`, timezone).startMs),
      end: new Date(localDayBounds(`${next}-01`, timezone).startMs),
    };
  })();
  const [visitTouch, corrTouch] = await Promise.all([
    prisma.visit.findFirst({
      where: { userId, startAt: { gte: start, lt: end } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.visitCorrectionRequest.findFirst({
      where: { userId, dayKey: { startsWith: monthKey } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  const ms = Math.max(visitTouch?.updatedAt.getTime() ?? 0, corrTouch?.updatedAt.getTime() ?? 0);
  return String(ms);
}

export async function computeUserYear(userId: string, year: number): Promise<YearPayload> {
  const rules = await getPolicy();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const timezone = user.timezone || rules.timezone || "Asia/Kolkata";
  const pointsTarget = rules.monthlyPointsTarget ?? DEFAULT_POINTS_TARGET;
  const { start, end } = yearBounds(year, timezone);
  const now = new Date();
  const currentMonth = monthKeyInTz(now, timezone);
  const currentYear = Number(currentMonth.slice(0, 4));

  const [visits, pointRows, { nameOf, pointsOf }, corrections, boundaryVisits] = await Promise.all([
    prisma.visit.findMany({
      where: { userId, startAt: { gte: start, lt: end } },
      orderBy: { startAt: "asc" },
    }),
    listPointOffices(),
    officeNameResolver(userId),
    prisma.visitCorrectionRequest.findMany({
      where: { userId, dayKey: { gte: `${year}-01-01`, lt: `${year + 1}-01-01` } },
      select: { status: true, dayKey: true },
    }),
    prisma.visit.findMany({
      where: { userId },
      orderBy: { startAt: "asc" },
      select: { startAt: true },
      take: 1,
    }).then(async (first) => {
      const last = await prisma.visit.findMany({
        where: { userId },
        orderBy: { startAt: "desc" },
        select: { startAt: true },
        take: 1,
      });
      return { first: first[0] ?? null, last: last[0] ?? null };
    }),
  ]);

  const computed: ComputedVisit[] = visits
    .filter((v) => v.endAt)
    .map((v) => {
      const startMs = v.startAt.getTime();
      const endMs = v.endAt!.getTime();
      return {
        startAt: v.startAt.toISOString(),
        endAt: v.endAt!.toISOString(),
        source:
          v.source === "admin" || v.source === "correction"
            ? "admin"
            : v.source === "manual"
              ? "manual"
              : "auto",
        hours: Math.max(0, (endMs - startMs) / 3_600_000),
        officeLocationId: v.officeLocationId,
        pointsAwarded: v.pointsAwarded ?? 0,
      };
    });

  // Open visits still in progress: count through now for current day stats.
  for (const v of visits.filter((x) => !x.endAt)) {
    const startMs = v.startAt.getTime();
    const endMs = Date.now();
    computed.push({
      startAt: v.startAt.toISOString(),
      endAt: new Date(endMs).toISOString(),
      source: "auto",
      hours: Math.max(0, (endMs - startMs) / 3_600_000),
      officeLocationId: v.officeLocationId,
      pointsAwarded: v.pointsAwarded ?? 0,
    });
  }

  const days = computeDayPoints(computed, timezone, pointRows.map(toFence));
  const dayByKey = new Map(days.map((d) => [d.dayKey, d]));

  const months: YearMonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    const monthDays = days.filter((d) => d.dayKey.startsWith(month));
    const points = monthDays.reduce((s, d) => s + d.points, 0);
    const visitDays = monthDays.filter((d) => d.visited).length;
    const isFuture = year > currentYear || (year === currentYear && month > currentMonth);
    const isCurrent = month === currentMonth;
    months.push({
      month,
      label: MONTH_SHORT[m - 1]!,
      points: isFuture ? 0 : points,
      visitDays: isFuture ? 0 : visitDays,
      targetMet: !isFuture && points >= pointsTarget,
      isCurrent,
      isFuture,
    });
  }

  const elapsedMonths = months.filter((m) => !m.isFuture);
  const monthsMet = elapsedMonths.filter((m) => m.targetMet).length;
  const monthsElapsed = elapsedMonths.length;
  const targetSoFar = monthsElapsed * pointsTarget;
  const yearPoints = elapsedMonths.reduce((s, m) => s + m.points, 0);
  const yearVisitDays = elapsedMonths.reduce((s, m) => s + m.visitDays, 0);
  const thisMonth = months.find((m) => m.isCurrent);
  const pointsThisMonth = thisMonth?.points ?? 0;
  const toGoThisMonth = Math.max(0, pointsTarget - pointsThisMonth);

  // Offices: points = sum of day points attributed to that office (day's max office).
  type OfficeAgg = { visitDays: number; points: number; pointsPerVisitDay: number };
  const officeMap = new Map<string, OfficeAgg>();
  for (const d of days) {
    if (!d.visited) continue;
    const id = d.officeLocationId ?? "unknown";
    const cur = officeMap.get(id) ?? {
      visitDays: 0,
      points: 0,
      pointsPerVisitDay: pointsOf(d.officeLocationId),
    };
    cur.visitDays += 1;
    cur.points += d.points;
    officeMap.set(id, cur);
  }
  const offices: YearOfficeRow[] = [...officeMap.entries()]
    .map(([id, v]) => ({
      officeLocationId: id === "unknown" ? null : id,
      name: id === "unknown" ? "Office" : nameOf(id),
      visitDays: v.visitDays,
      points: v.points,
      pointsPerVisitDay: v.pointsPerVisitDay,
    }))
    .sort((a, b) => b.points - a.points || b.visitDays - a.visitDays);

  const weekdayCounts = new Map<number, number>();
  for (const d of days) {
    if (!d.visited) continue;
    const wd = isoWeekday(d.dayKey, timezone);
    if (wd >= 1 && wd <= 5) weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);
  }
  const weekdays: YearWeekdayRow[] = WEEKDAY_LABELS.map((label, i) => ({
    weekday: i + 1,
    label,
    visitDays: weekdayCounts.get(i + 1) ?? 0,
  }));

  const arrivals: number[] = [];
  const leavings: number[] = [];
  for (const d of days) {
    if (!d.visited || !d.firstIn || !d.lastOut) continue;
    arrivals.push(minutesOfDay(d.firstIn, timezone));
    leavings.push(minutesOfDay(d.lastOut, timezone));
  }
  const usualArrivalMins = medianMinutes(arrivals);
  const usualLeavingMins = medianMinutes(leavings);
  const avgHours =
    days.filter((d) => d.visited).length === 0
      ? 0
      : days.filter((d) => d.visited).reduce((s, d) => s + d.hours, 0) / days.filter((d) => d.visited).length;

  // Multi-office days: distinct offices on the same dayKey from visit rows.
  const officesByDay = new Map<string, Set<string>>();
  for (const v of visits) {
    const key = dayKeyInTz(v.startAt, timezone);
    if (!dayByKey.has(key)) continue;
    const set = officesByDay.get(key) ?? new Set();
    if (v.officeLocationId) set.add(v.officeLocationId);
    officesByDay.set(key, set);
  }
  let multiOfficeDays = 0;
  for (const set of officesByDay.values()) {
    if (set.size >= 2) multiOfficeDays += 1;
  }

  const adminEditedDayKeys = new Set(
    visits
      .filter((v) => v.source === "admin" || Boolean(v.editedBy))
      .map((v) => dayKeyInTz(v.startAt, timezone)),
  );

  const yearsFromVisits = new Set<number>();
  if (boundaryVisits.first) {
    yearsFromVisits.add(Number(dayKeyInTz(boundaryVisits.first.startAt, timezone).slice(0, 4)));
  }
  if (boundaryVisits.last) {
    yearsFromVisits.add(Number(dayKeyInTz(boundaryVisits.last.startAt, timezone).slice(0, 4)));
  }
  yearsFromVisits.add(currentYear);
  yearsFromVisits.add(year);
  // Fill inclusive range between first and last visit years.
  if (yearsFromVisits.size >= 2) {
    const lo = Math.min(...yearsFromVisits);
    const hi = Math.max(...yearsFromVisits);
    for (let y = lo; y <= hi; y++) yearsFromVisits.add(y);
  }
  const yearsWithData = [...yearsFromVisits].sort((a, b) => b - a);

  return {
    year,
    generatedAt: now.toISOString(),
    timezone,
    pointsTarget,
    currentMonth,
    yearsWithData,
    summary: {
      points: yearPoints,
      visitDays: yearVisitDays,
      monthsMet,
      monthsElapsed,
      targetSoFar,
      pointsThisMonth,
      toGoThisMonth,
      currentMonthLabel: thisMonth ? monthLabelLong(thisMonth.month) : monthLabelLong(currentMonth),
    },
    months,
    offices,
    weekdays,
    visitDayKeys: days.filter((d) => d.visited).map((d) => d.dayKey),
    usualArrival: usualArrivalMins != null ? formatClock(usualArrivalMins) : null,
    usualLeaving: usualLeavingMins != null ? formatClock(usualLeavingMins) : null,
    averageHoursPerVisitDay: Math.round(avgHours * 100) / 100,
    multiOfficeDays,
    correctionRequests: corrections.length,
    correctionApproved: corrections.filter((c) => c.status === "approved").length,
    adminEditedDays: adminEditedDayKeys.size,
  };
}

/** Parse client month versions query: "2026-10:123,2026-09:456" */
export function parseClientMonthVersions(raw: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const month = part.slice(0, idx).trim();
    const ver = part.slice(idx + 1).trim();
    if (/^\d{4}-\d{2}$/.test(month) && ver) map.set(month, ver);
  }
  return map;
}
