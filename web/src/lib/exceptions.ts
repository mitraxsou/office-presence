import { prisma } from "./db";
import { getPolicy } from "./policy";
import { isMonthLocked } from "./corrections-rules";
import { computeUserMonth, recomputeUserPresence, monthKeyInTz } from "./presence";
import { holidayKeysForOffice } from "./holidays";
import { monthDayRange } from "./exception-days";

export { exceptionDaysForUserMonth, exceptionDaysForUserRange, monthDayRange } from "./exception-days";

export type ExceptionKind = "days" | "month";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
/** Longest "Several days" range. A whole month uses kind "month". */
export const MAX_RANGE_DAYS = 62;

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isWeekday(dayKey: string): boolean {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday to Friday, inclusive range, skipping the given holiday day keys. */
export function workingDaysBetween(startDay: string, endDay: string, holidays: Set<string>): string[] {
  const out: string[] = [];
  for (let day = startDay; day <= endDay; day = addDays(day, 1)) {
    if (isWeekday(day) && !holidays.has(day)) out.push(day);
  }
  return out;
}

/** Working days for a home office: weekdays that are not a holiday for that office (or all offices). */
export async function expandWorkingDays(startDay: string, endDay: string, officeId: string): Promise<string[]> {
  const holidays = await holidayKeysForOffice(officeId, startDay, endDay);
  return workingDaysBetween(startDay, endDay, holidays);
}

export type ExceptionRangeInput = {
  kind: ExceptionKind;
  startDay?: string;
  endDay?: string;
  monthKey?: string;
};

export function resolveRange(
  input: ExceptionRangeInput,
): { ok: true; startDay: string; endDay: string } | { ok: false; error: string } {
  if (input.kind === "month") {
    const monthKey = input.monthKey ?? input.startDay?.slice(0, 7);
    if (!monthKey || !MONTH_RE.test(monthKey)) return { ok: false, error: "Choose a month" };
    return { ok: true, ...monthDayRange(monthKey) };
  }
  if (input.kind !== "days") return { ok: false, error: "Choose single day, several days, or whole month" };
  const startDay = input.startDay;
  const endDay = input.endDay || input.startDay;
  if (!isDayKey(startDay) || !isDayKey(endDay)) return { ok: false, error: "Choose valid dates" };
  if (endDay < startDay) return { ok: false, error: "The end date is before the start date" };
  if (addDays(startDay, MAX_RANGE_DAYS) <= endDay) {
    return { ok: false, error: `Choose ${MAX_RANGE_DAYS} days or fewer, or use Whole month` };
  }
  return { ok: true, startDay, endDay };
}

/** Distinct month keys of a list of day keys, in order. */
export function monthsOf(dayKeys: string[]): string[] {
  return [...new Set(dayKeys.map((d) => d.slice(0, 7)))].sort();
}

type Office = { id: string; name: string; pointsPerVisitDay: number };

async function resolveOffice(
  userId: string,
  officeLocationId: string | null | undefined,
): Promise<{ ok: true; office: Office; user: { id: string; homeOfficeId: string | null } } | { ok: false; error: string; status: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, homeOfficeId: true, deactivatedAt: true },
  });
  if (!user) return { ok: false, error: "Person not found", status: 404 };
  const officeId = officeLocationId || user.homeOfficeId;
  if (!officeId) return { ok: false, error: "This person has no home office. Choose an office.", status: 400 };
  const office = await prisma.officeLocation.findUnique({
    where: { id: officeId },
    select: { id: true, name: true, pointsPerVisitDay: true },
  });
  if (!office) return { ok: false, error: "Office not found", status: 400 };
  return { ok: true, office, user };
}

export type MonthEffect = {
  monthKey: string;
  days: number;
  before: number;
  after: number;
  added: number;
  locked: boolean;
};

export type ExceptionPreview = {
  startDay: string;
  endDay: string;
  days: string[];
  skippedDays: number;
  officeLocationId: string;
  officeName: string;
  pointsPerDay: number;
  total: number;
  months: MonthEffect[];
  lockedMonths: string[];
};

/** Working days, points per day, and the points each month gains (a day takes the higher of visit and exception). */
export async function previewException(input: {
  userId: string;
  kind: ExceptionKind;
  startDay?: string;
  endDay?: string;
  monthKey?: string;
  officeLocationId?: string | null;
  now?: Date;
}): Promise<{ ok: true; preview: ExceptionPreview } | { ok: false; error: string; status: number }> {
  const range = resolveRange(input);
  if (!range.ok) return { ok: false, error: range.error, status: 400 };
  const resolved = await resolveOffice(input.userId, input.officeLocationId);
  if (!resolved.ok) return resolved;
  const { office } = resolved;
  const policy = await getPolicy();
  const days = await expandWorkingDays(range.startDay, range.endDay, office.id);
  const pointsPerDay = Math.max(0, Math.round(office.pointsPerVisitDay));
  const now = input.now ?? new Date();
  const currentMonth = monthKeyInTz(now, policy.timezone);
  const months: MonthEffect[] = [];
  for (const monthKey of monthsOf(days)) {
    const inMonth = days.filter((d) => d.startsWith(monthKey));
    const view = monthKey <= currentMonth ? await computeUserMonth(input.userId, monthKey) : null;
    const dayPoints = new Map((view?.days ?? []).map((d) => [d.dayKey, d.points]));
    const before = view?.summary.points ?? 0;
    const added = inMonth.reduce((s, d) => s + Math.max(0, pointsPerDay - (dayPoints.get(d) ?? 0)), 0);
    months.push({
      monthKey,
      days: inMonth.length,
      before,
      after: before + added,
      added,
      locked: isMonthLocked(`${monthKey}-01`, policy.correctionWindowDays ?? 5, now, policy.timezone),
    });
  }
  const total = days.length * pointsPerDay;
  let calendarDays = 0;
  for (let d = range.startDay; d <= range.endDay; d = addDays(d, 1)) calendarDays += 1;
  return {
    ok: true,
    preview: {
      startDay: range.startDay,
      endDay: range.endDay,
      days,
      skippedDays: calendarDays - days.length,
      officeLocationId: office.id,
      officeName: office.name,
      pointsPerDay,
      total,
      months,
      lockedMonths: months.filter((m) => m.locked).map((m) => m.monthKey),
    },
  };
}

export type GrantInput = {
  actorId: string;
  userId: string;
  kind: ExceptionKind;
  startDay?: string;
  endDay?: string;
  monthKey?: string;
  officeLocationId?: string | null;
  reason: string;
  reference?: string | null;
  /** Required when any covered month is closed. */
  confirmClosedMonth?: boolean;
  closedMonthReason?: string | null;
  now?: Date;
};

/**
 * Grant applies immediately, like an admin approval: days stored, month recomputed.
 * No VisitCorrectionRequest and no auto-approve allowance is used.
 */
export async function grantException(input: GrantInput) {
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) return { ok: false as const, error: "Add a reason", status: 400 };
  if (input.actorId === input.userId) {
    return { ok: false as const, error: "You cannot grant an exception to yourself. Ask another admin or HR.", status: 403 };
  }
  const previewed = await previewException(input);
  if (!previewed.ok) return previewed;
  const preview = previewed.preview;
  if (!preview.days.length) {
    return { ok: false as const, error: "No working days in this range. Weekends and holidays are skipped.", status: 400 };
  }
  const policy = await getPolicy();
  const closedReason = input.closedMonthReason?.trim().slice(0, 500) ?? "";
  if (preview.lockedMonths.length) {
    if (!policy.allowExceptionsInClosedMonths) {
      return { ok: false as const, error: "This month is closed. Exceptions cannot be added to closed months.", status: 400 };
    }
    if (!input.confirmClosedMonth || !closedReason) {
      return {
        ok: false as const,
        error: "This month is closed. Confirm and give a reason to add the exception.",
        status: 409,
        lockedMonths: preview.lockedMonths,
      };
    }
  }

  const reference = input.reference?.trim().slice(0, 100) || null;
  const created = await prisma.presenceException.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      startDay: preview.startDay,
      endDay: preview.endDay,
      officeLocationId: preview.officeLocationId,
      pointsPerDay: preview.pointsPerDay,
      reason: closedReason ? `${reason} (closed month: ${closedReason})` : reason,
      reference,
      grantedById: input.actorId,
      days: {
        create: preview.days.map((dayKey) => ({ userId: input.userId, dayKey, points: preview.pointsPerDay })),
      },
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "exception.grant",
      targetType: "user",
      targetId: input.userId,
      afterJson: {
        exceptionId: created.id,
        kind: input.kind,
        startDay: preview.startDay,
        endDay: preview.endDay,
        officeLocationId: preview.officeLocationId,
        pointsPerDay: preview.pointsPerDay,
        days: preview.days,
        total: preview.total,
        reference,
        closedMonths: preview.lockedMonths,
      },
      reason: created.reason,
    },
  });
  await recomputeUserPresence(input.userId);
  return { ok: true as const, exception: created, preview };
}

/** Revoke, never delete. Revoked days stop counting. */
export async function revokeException(input: { actorId: string; id: string; reason: string; now?: Date }) {
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) return { ok: false as const, error: "Add a reason", status: 400 };
  const row = await prisma.presenceException.findUnique({
    where: { id: input.id },
    include: { days: { select: { dayKey: true, points: true } } },
  });
  if (!row) return { ok: false as const, error: "Not found", status: 404 };
  if (row.revokedAt) return { ok: false as const, error: "Already revoked", status: 400 };
  if (row.userId === input.actorId) {
    return { ok: false as const, error: "You cannot revoke your own exception. Ask another admin or HR.", status: 403 };
  }
  const policy = await getPolicy();
  const now = input.now ?? new Date();
  const locked = monthsOf(row.days.map((d) => d.dayKey)).filter((m) =>
    isMonthLocked(`${m}-01`, policy.correctionWindowDays ?? 5, now, policy.timezone),
  );
  if (locked.length && !policy.allowExceptionsInClosedMonths) {
    return { ok: false as const, error: "This month is closed. Exceptions in closed months cannot be changed.", status: 400 };
  }
  const updated = await prisma.presenceException.update({
    where: { id: row.id },
    data: { revokedAt: now, revokedById: input.actorId, revokeReason: reason },
  });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "exception.revoke",
      targetType: "user",
      targetId: row.userId,
      beforeJson: {
        exceptionId: row.id,
        startDay: row.startDay,
        endDay: row.endDay,
        pointsPerDay: row.pointsPerDay,
        days: row.days.map((d) => d.dayKey),
      },
      reason,
    },
  });
  await recomputeUserPresence(row.userId);
  return { ok: true as const, exception: updated };
}
