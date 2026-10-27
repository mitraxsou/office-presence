import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { computeUserMonth } from "@/lib/presence";
import { isMonthLocked } from "@/lib/corrections-rules";

export type CorrectionIssue = "missing_visit" | "wrong_times" | "wrong_office" | "should_not_count";

export type RequestedSnapshot =
  | { remove: true }
  | { office_id: string | null; in_at: string; out_at: string };

export { isMonthLocked };

export async function dayVisitSnapshot(userId: string, dayKey: string) {
  const month = await computeUserMonth(userId, dayKey.slice(0, 7));
  const day = month.days.find((d) => d.dayKey === dayKey);
  return {
    dayKey,
    points: day?.points ?? 0,
    hours: day?.hours ?? 0,
    officeName: day?.officeName ?? null,
    intervals: day?.intervals ?? [],
  };
}

export async function previewEffect(
  userId: string,
  dayKey: string,
  requested: RequestedSnapshot,
): Promise<{ days_before: number; days_after: number }> {
  const month = await computeUserMonth(userId, dayKey.slice(0, 7));
  const daysBefore = month.summary.points;
  const currentDay = month.days.find((d) => d.dayKey === dayKey);
  const currentPts = currentDay?.points ?? 0;

  if ("remove" in requested && requested.remove) {
    return { days_before: daysBefore, days_after: Math.max(0, daysBefore - currentPts) };
  }

  const officeId = "office_id" in requested ? requested.office_id : null;
  let add = 1;
  if (officeId) {
    const office = await prisma.officeLocation.findUnique({ where: { id: officeId } });
    add = office?.pointsPerVisitDay ?? 1;
  }
  return { days_before: daysBefore, days_after: daysBefore - currentPts + add };
}

export async function assertCanCreate(userId: string, dayKey: string) {
  const policy = await getPolicy();
  const windowDays = policy.correctionWindowDays ?? 5;
  if (isMonthLocked(dayKey, windowDays)) {
    return { ok: false as const, error: "This month is locked for corrections", status: 400 };
  }
  const pending = await prisma.visitCorrectionRequest.findFirst({
    where: { userId, dayKey, status: "pending" },
  });
  if (pending) {
    return { ok: false as const, error: "A pending correction already exists for this day", status: 409 };
  }
  return { ok: true as const, policy };
}
