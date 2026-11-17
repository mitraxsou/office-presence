import { prisma } from "./db";
import { displayName } from "./display-name";
import { holidaysForOffice } from "./holidays";
import { monthDayRange } from "./exception-days";

export type EmployeeHoliday = { dayKey: string; name: string };
export type EmployeeLeave = { dayKey: string; kind: string; note: string | null; source: string };
export type EmployeeExceptionDay = {
  dayKey: string;
  points: number;
  exceptionId: string;
  officeName: string;
  homeOffice: boolean;
  reason: string;
  grantedBy: string | null;
  grantedAt: string;
};
export type ExceptionAdded = {
  id: string;
  createdAt: string;
  startDay: string;
  endDay: string;
  days: string[];
  pointsPerDay: number;
  officeName: string;
};

const nameSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  email: true,
  colleagueDisplayMode: true,
} as const;

function span(monthKeys: string[]) {
  const sorted = [...monthKeys].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  if (!sorted.length) return null;
  return { startDay: monthDayRange(sorted[0]).startDay, endDay: monthDayRange(sorted[sorted.length - 1]).endDay };
}

async function officeNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await prisma.officeLocation.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((o) => [o.id, o.name]));
}

/** Holidays for the home office, leave days and active HR exception days. Information for the person themselves. */
export async function employeeMonthRecords(
  user: { id: string; homeOfficeId: string | null },
  monthKeys: string[],
): Promise<{ holidays: EmployeeHoliday[]; leaveDays: EmployeeLeave[]; exceptionDays: EmployeeExceptionDay[] }> {
  const range = span(monthKeys);
  if (!range) return { holidays: [], leaveDays: [], exceptionDays: [] };
  const months = new Set(monthKeys);
  const inMonths = (dayKey: string) => months.has(dayKey.slice(0, 7));
  const [holidays, leave, days] = await Promise.all([
    holidaysForOffice(user.homeOfficeId, range.startDay, range.endDay),
    prisma.leaveDay.findMany({
      where: { userId: user.id, dayKey: { gte: range.startDay, lte: range.endDay } },
      orderBy: { dayKey: "asc" },
      select: { dayKey: true, kind: true, note: true, source: true },
    }),
    prisma.presenceExceptionDay.findMany({
      where: { userId: user.id, dayKey: { gte: range.startDay, lte: range.endDay }, exception: { revokedAt: null } },
      orderBy: { dayKey: "asc" },
      select: {
        dayKey: true,
        points: true,
        exceptionId: true,
        exception: { select: { officeLocationId: true, reason: true, grantedById: true, createdAt: true } },
      },
    }),
  ]);
  const granterIds = [...new Set(days.map((d) => d.exception.grantedById))];
  const [granters, offices] = await Promise.all([
    granterIds.length
      ? prisma.user.findMany({ where: { id: { in: granterIds } }, select: nameSelect })
      : Promise.resolve([]),
    officeNames([...new Set(days.map((d) => d.exception.officeLocationId))]),
  ]);
  const granterName = new Map(granters.map((g) => [g.id, displayName(g)]));

  const best = new Map<string, EmployeeExceptionDay>();
  for (const d of days) {
    if (!inMonths(d.dayKey)) continue;
    const cur = best.get(d.dayKey);
    if (cur && cur.points >= d.points) continue;
    best.set(d.dayKey, {
      dayKey: d.dayKey,
      points: d.points,
      exceptionId: d.exceptionId,
      officeName: offices.get(d.exception.officeLocationId) ?? "Office",
      homeOffice: d.exception.officeLocationId === user.homeOfficeId,
      reason: d.exception.reason,
      grantedBy: granterName.get(d.exception.grantedById) ?? null,
      grantedAt: d.exception.createdAt.toISOString(),
    });
  }

  const holidayByDay = new Map<string, EmployeeHoliday>();
  for (const h of holidays) {
    if (!inMonths(h.dayKey)) continue;
    // An office-specific name wins over the all-offices row for the same date.
    if (!holidayByDay.has(h.dayKey) || h.officeLocationId) holidayByDay.set(h.dayKey, { dayKey: h.dayKey, name: h.name });
  }

  return {
    holidays: [...holidayByDay.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
    leaveDays: leave.filter((l) => inMonths(l.dayKey)),
    exceptionDays: [...best.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
  };
}

/** Active exceptions granted to the person since a date. The phone keeps seen ids and notifies once. */
export async function exceptionsAddedSince(userId: string, since: Date): Promise<ExceptionAdded[]> {
  const rows = await prisma.presenceException.findMany({
    where: { userId, revokedAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      startDay: true,
      endDay: true,
      pointsPerDay: true,
      officeLocationId: true,
      days: { select: { dayKey: true }, orderBy: { dayKey: "asc" } },
    },
  });
  const offices = await officeNames([...new Set(rows.map((r) => r.officeLocationId))]);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    startDay: r.startDay,
    endDay: r.endDay,
    days: r.days.map((d) => d.dayKey),
    pointsPerDay: r.pointsPerDay,
    officeName: offices.get(r.officeLocationId) ?? "Office",
  }));
}
