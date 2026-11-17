import { prisma } from "./db";
import { monthDayRange } from "./exception-days";
import { isWeekday } from "./exceptions";

export type MonthRecordCounts = {
  exceptionDays: number;
  exceptionPoints: number;
  leaveDays: number;
  holidays: number;
};

/**
 * Per person, for one month: HR exception days and their points (highest per day), leave days,
 * and weekday holidays for their home office. Leave and holidays are records only.
 */
export async function monthRecordCounts(
  users: Array<{ id: string; homeOfficeId: string | null }>,
  monthKey: string,
): Promise<Map<string, MonthRecordCounts>> {
  const { startDay, endDay } = monthDayRange(monthKey);
  const ids = users.map((u) => u.id);
  const [exceptionDays, leaveDays, holidays] = await Promise.all([
    prisma.presenceExceptionDay.findMany({
      where: { userId: { in: ids }, dayKey: { gte: startDay, lte: endDay }, exception: { revokedAt: null } },
      select: { userId: true, dayKey: true, points: true },
    }),
    prisma.leaveDay.findMany({
      where: { userId: { in: ids }, dayKey: { gte: startDay, lte: endDay } },
      select: { userId: true },
    }),
    prisma.holiday.findMany({
      where: { dayKey: { gte: startDay, lte: endDay } },
      select: { dayKey: true, officeLocationId: true },
    }),
  ]);
  const out = new Map<string, MonthRecordCounts>();
  for (const u of users) out.set(u.id, { exceptionDays: 0, exceptionPoints: 0, leaveDays: 0, holidays: 0 });

  const bestByDay = new Map<string, number>();
  for (const d of exceptionDays) {
    const key = `${d.userId}|${d.dayKey}`;
    bestByDay.set(key, Math.max(bestByDay.get(key) ?? 0, d.points));
  }
  for (const [key, points] of bestByDay) {
    const row = out.get(key.split("|")[0]!);
    if (!row) continue;
    row.exceptionDays += 1;
    row.exceptionPoints += points;
  }
  for (const l of leaveDays) {
    const row = out.get(l.userId);
    if (row) row.leaveDays += 1;
  }
  for (const u of users) {
    const days = new Set(
      holidays
        .filter((h) => isWeekday(h.dayKey) && (h.officeLocationId == null || h.officeLocationId === u.homeOfficeId))
        .map((h) => h.dayKey),
    );
    out.get(u.id)!.holidays = days.size;
  }
  return out;
}
