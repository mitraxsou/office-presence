import { prisma } from "./db";
import { displayName } from "./display-name";
import { getPolicy } from "./policy";
import { computeUserMonth, monthKeyInTz } from "./presence";
import { dayKeyInTz } from "./visit-calculator";
import { employeeMonthRecords } from "./employee-records";
import { monthDayRange } from "./exception-days";
import { isWeekday } from "./exceptions";

/**
 * Manager payloads. Built from an allow-list of fields so hours, device names,
 * Wi-Fi, coordinates and HR reasons never reach a manager.
 */
export type TeamPersonRow = {
  id: string;
  name: string;
  email: string;
  teamName: string | null;
  inOffice: boolean;
  sinceAt: string | null;
  officeName: string | null;
  monthPoints: number;
  pointsTarget: number;
  goalMet: boolean;
  exceptionDays: number;
  onLeaveToday: string | null;
  /** Weekdays from today to month end, minus holidays for the home office. */
  daysLeft: number;
  pendingRequests: number;
};

export function workingDaysLeft(todayKey: string, endDay: string, holidays: Set<string>): number {
  const [y, m, d] = todayKey.split("-").map(Number);
  let n = 0;
  for (let t = Date.UTC(y, m - 1, d); ; t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    if (key > endDay) break;
    if (isWeekday(key) && !holidays.has(key)) n += 1;
  }
  return n;
}

export type TeamMonthDay = {
  dayKey: string;
  points: number;
  officeName: string | null;
  firstIn: string | null;
  lastOut: string | null;
  exception: { points: number; officeName: string } | null;
};

const personSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  colleagueDisplayMode: true,
  homeOfficeId: true,
  team: { select: { name: true } },
  status: { select: { inOffice: true, sinceAt: true, officeName: true, monthPoints: true } },
} as const;

export function teamStats(rows: Pick<TeamPersonRow, "inOffice" | "goalMet">[]) {
  return {
    people: rows.length,
    inNow: rows.filter((r) => r.inOffice).length,
    goalMet: rows.filter((r) => r.goalMet).length,
    belowTarget: rows.filter((r) => !r.goalMet).length,
  };
}

/** Light count for the phone "My team" row. Always against the policy target. */
export async function teamSummary(ids: string[], target: number) {
  if (!ids.length) return { people: 0, belowTarget: 0 };
  const rows = await prisma.currentStatus.findMany({ where: { userId: { in: ids } }, select: { monthPoints: true } });
  const met = rows.filter((r) => r.monthPoints >= target).length;
  return { people: ids.length, belowTarget: ids.length - met };
}

export async function teamStatus(ids: string[]) {
  const policy = await getPolicy();
  const target = policy.monthlyPointsTarget ?? 8;
  const now = new Date();
  const monthKey = monthKeyInTz(now, policy.timezone);
  const todayKey = dayKeyInTz(now, policy.timezone);
  const { startDay, endDay } = monthDayRange(monthKey);
  const [users, exDays, leave, holidays, pending] = ids.length
    ? await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { email: "asc" }, select: personSelect }),
        prisma.presenceExceptionDay.findMany({
          where: { userId: { in: ids }, dayKey: { gte: startDay, lte: endDay }, exception: { revokedAt: null } },
          select: { userId: true, dayKey: true },
        }),
        prisma.leaveDay.findMany({ where: { userId: { in: ids }, dayKey: todayKey }, select: { userId: true, kind: true } }),
        prisma.holiday.findMany({
          where: { dayKey: { gte: todayKey, lte: endDay } },
          select: { dayKey: true, officeLocationId: true },
        }),
        prisma.visitCorrectionRequest.groupBy({
          by: ["userId"],
          where: { userId: { in: ids }, status: "pending" },
          _count: { _all: true },
        }),
      ])
    : [[], [], [], [], []];
  const pendingBy = new Map(pending.map((p) => [p.userId, p._count._all]));
  const holidaysFor = (officeId: string | null) =>
    new Set(holidays.filter((h) => h.officeLocationId == null || h.officeLocationId === officeId).map((h) => h.dayKey));
  const exBy = new Map<string, Set<string>>();
  for (const d of exDays) {
    const set = exBy.get(d.userId) ?? new Set<string>();
    set.add(d.dayKey);
    exBy.set(d.userId, set);
  }
  const leaveBy = new Map(leave.map((l) => [l.userId, l.kind]));
  const people: TeamPersonRow[] = users.map((u) => {
    const monthPoints = u.status?.monthPoints ?? 0;
    return {
      id: u.id,
      name: displayName(u),
      email: u.email,
      teamName: u.team?.name ?? null,
      inOffice: u.status?.inOffice ?? false,
      sinceAt: u.status?.sinceAt?.toISOString() ?? null,
      officeName: u.status?.inOffice ? u.status.officeName ?? null : null,
      monthPoints,
      pointsTarget: target,
      goalMet: monthPoints >= target,
      exceptionDays: exBy.get(u.id)?.size ?? 0,
      onLeaveToday: leaveBy.get(u.id) ?? null,
      daysLeft: workingDaysLeft(todayKey, endDay, holidaysFor(u.homeOfficeId)),
      pendingRequests: pendingBy.get(u.id) ?? 0,
    };
  });
  return {
    month: monthKey,
    pointsTarget: target,
    canDecideCorrections: policy.managersDecideCorrections === true,
    stats: teamStats(people),
    people,
  };
}

export function toTeamMonthDays(
  days: {
    dayKey: string;
    points: number;
    officeName: string | null;
    exception?: { points: number } | null;
    intervals?: { startAt: string; endAt: string | null }[];
  }[],
  exceptionOffice: Map<string, string>,
): TeamMonthDay[] {
  return days.map((d) => ({
    dayKey: d.dayKey,
    points: d.points,
    officeName: d.officeName,
    firstIn: d.intervals?.[0]?.startAt ?? null,
    lastOut: d.intervals?.length ? d.intervals[d.intervals.length - 1].endAt ?? null : null,
    exception: d.exception
      ? { points: d.exception.points, officeName: exceptionOffice.get(d.dayKey) ?? "Office" }
      : null,
  }));
}

export async function teamMemberMonth(userId: string, monthKey: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: personSelect });
  if (!user) return null;
  const policy = await getPolicy();
  const current = monthKeyInTz(new Date(), policy.timezone);
  const month = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : current;
  const [view, records, corrections] = await Promise.all([
    computeUserMonth(userId, month),
    employeeMonthRecords({ id: user.id, homeOfficeId: user.homeOfficeId }, [month]),
    prisma.visitCorrectionRequest.findMany({
      where: { userId, dayKey: { startsWith: `${month}-` } },
      orderBy: { createdAt: "desc" },
      select: { id: true, dayKey: true, status: true, createdAt: true, reviewedAt: true },
    }),
  ]);
  const exOffice = new Map(records.exceptionDays.map((e) => [e.dayKey, e.officeName]));
  return {
    person: {
      id: user.id,
      name: displayName(user),
      teamName: user.team?.name ?? null,
      inOffice: user.status?.inOffice ?? false,
      sinceAt: user.status?.sinceAt?.toISOString() ?? null,
      officeName: user.status?.inOffice ? user.status.officeName ?? null : null,
    },
    month: view.monthKey,
    currentMonth: current,
    timezone: view.timezone,
    monthPoints: view.summary.points,
    monthVisitDays: view.summary.visitDays,
    pointsTarget: view.summary.target,
    targetMet: view.summary.targetMet,
    exceptionDayCount: view.days.filter((d) => d.exception).length,
    days: toTeamMonthDays(view.days, exOffice),
    holidays: records.holidays,
    leaveDays: records.leaveDays.map((l) => ({ dayKey: l.dayKey, kind: l.kind })),
    corrections: corrections.map((c) => ({
      id: c.id,
      dayKey: c.dayKey,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
    })),
  };
}
