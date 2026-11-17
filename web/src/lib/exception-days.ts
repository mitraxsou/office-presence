import { prisma } from "./db";
import type { ExceptionDayInput } from "./visit-calculator";

export function monthDayRange(monthKey: string): { startDay: string; endDay: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { startDay: `${monthKey}-01`, endDay: `${monthKey}-${String(last).padStart(2, "0")}` };
}

/** Non-revoked exception days for a person in [startDay, endDay]. */
export async function exceptionDaysForUserRange(
  userId: string,
  startDay: string,
  endDay: string,
): Promise<ExceptionDayInput[]> {
  const rows = await prisma.presenceExceptionDay.findMany({
    where: { userId, dayKey: { gte: startDay, lte: endDay }, exception: { revokedAt: null } },
    select: { dayKey: true, points: true, exceptionId: true, exception: { select: { officeLocationId: true } } },
  });
  return rows.map((r) => ({
    dayKey: r.dayKey,
    points: r.points,
    exceptionId: r.exceptionId,
    officeLocationId: r.exception.officeLocationId,
  }));
}

export async function exceptionDaysForUserMonth(userId: string, monthKey: string): Promise<ExceptionDayInput[]> {
  const { startDay, endDay } = monthDayRange(monthKey);
  return exceptionDaysForUserRange(userId, startDay, endDay);
}
