import { prisma } from "./db";
import { getPolicy } from "./policy";
import { isMonthLocked } from "./corrections-rules";
import { isDayKey, isWeekday } from "./exceptions";
import { holidayKeysForOffice } from "./holidays";
import { monthKeyInTz } from "./presence";

export type LeaveKind = "leave" | "other_duty";

function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Employee leave: rule on, a working day for their home office, in the current or previous month. Lock is checked by setLeaveDay. */
export async function selfLeaveError(
  user: { id: string; homeOfficeId: string | null },
  dayKey: string,
  now = new Date(),
): Promise<string | null> {
  if (!isDayKey(dayKey)) return "date must be YYYY-MM-DD";
  const policy = await getPolicy();
  if (!policy.allowSelfLeave) return "Ask an admin to mark leave";
  const current = monthKeyInTz(now, policy.timezone);
  const month = dayKey.slice(0, 7);
  if (month !== current && month !== previousMonthKey(current)) {
    return "Leave can be marked for this month or last month only";
  }
  if (!isWeekday(dayKey)) return "Leave can be marked on working days only";
  const holidays = await holidayKeysForOffice(user.homeOfficeId, dayKey, dayKey);
  if (holidays.has(dayKey)) return "This day is a holiday";
  return null;
}

export function parseLeaveKind(value: unknown): LeaveKind | null {
  return value === "leave" || value === "other_duty" ? value : null;
}

/** Leave is a record only. It never changes points, visit days or the target. */
export async function setLeaveDay(input: {
  actorId: string;
  userId: string;
  dayKey: string;
  kind: LeaveKind;
  note?: string | null;
  source: "self" | "admin";
  now?: Date;
}) {
  if (!isDayKey(input.dayKey)) return { ok: false as const, error: "date must be YYYY-MM-DD", status: 400 };
  const policy = await getPolicy();
  if (isMonthLocked(input.dayKey, policy.correctionWindowDays ?? 5, input.now ?? new Date(), policy.timezone)) {
    return { ok: false as const, error: "This month is locked", status: 400 };
  }
  const note = input.note?.trim().slice(0, 200) || null;
  const before = await prisma.leaveDay.findUnique({
    where: { userId_dayKey: { userId: input.userId, dayKey: input.dayKey } },
  });
  const row = await prisma.leaveDay.upsert({
    where: { userId_dayKey: { userId: input.userId, dayKey: input.dayKey } },
    create: {
      userId: input.userId,
      dayKey: input.dayKey,
      kind: input.kind,
      note,
      source: input.source,
      createdById: input.actorId,
    },
    update: { kind: input.kind, note, source: input.source, createdById: input.actorId },
  });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.source === "self" ? "leave.self_set" : "leave.set",
      targetType: "user",
      targetId: input.userId,
      beforeJson: before ? { dayKey: before.dayKey, kind: before.kind, note: before.note } : undefined,
      afterJson: { dayKey: row.dayKey, kind: row.kind, note: row.note },
    },
  });
  return { ok: true as const, leave: row };
}

export async function clearLeaveDay(input: {
  actorId: string;
  userId: string;
  dayKey: string;
  source: "self" | "admin";
  now?: Date;
}) {
  if (!isDayKey(input.dayKey)) return { ok: false as const, error: "date must be YYYY-MM-DD", status: 400 };
  const policy = await getPolicy();
  if (isMonthLocked(input.dayKey, policy.correctionWindowDays ?? 5, input.now ?? new Date(), policy.timezone)) {
    return { ok: false as const, error: "This month is locked", status: 400 };
  }
  const before = await prisma.leaveDay.findUnique({
    where: { userId_dayKey: { userId: input.userId, dayKey: input.dayKey } },
  });
  if (!before) return { ok: true as const, removed: false };
  await prisma.leaveDay.delete({ where: { id: before.id } });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.source === "self" ? "leave.self_clear" : "leave.clear",
      targetType: "user",
      targetId: input.userId,
      beforeJson: { dayKey: before.dayKey, kind: before.kind, note: before.note },
    },
  });
  return { ok: true as const, removed: true };
}
