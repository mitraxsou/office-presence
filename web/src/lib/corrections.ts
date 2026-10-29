import type { Prisma, VisitCorrectionRequest } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeUserMonth, recomputeUserPresence } from "@/lib/presence";
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

/** A second open request for the same day is rejected. Past months are allowed. */
export async function assertNoPendingCorrection(userId: string, dayKey: string) {
  const pending = await prisma.visitCorrectionRequest.findFirst({
    where: { userId, dayKey, status: "pending" },
  });
  if (pending) {
    return { ok: false as const, error: "A pending correction already exists for this day", status: 409 };
  }
  return { ok: true as const };
}

export async function decideCorrection(opts: {
  row: VisitCorrectionRequest;
  actorId: string;
  decision: "approve" | "reject";
  applied: unknown;
  reviewNote: string | null;
}) {
  const { row, actorId, decision, reviewNote } = opts;
  const applied = opts.applied ?? row.requested ?? null;
  let visitId: string | null = null;

  if (decision === "approve") {
    const remove = applied && typeof applied === "object" && "remove" in applied && applied.remove === true;
    if (remove || row.issue === "should_not_count") {
      const dayStart = new Date(`${row.dayKey}T00:00:00.000Z`);
      const dayEnd = new Date(`${row.dayKey}T23:59:59.999Z`);
      await prisma.visitExclusion.create({
        data: {
          userId: row.userId,
          startAt: dayStart,
          endAt: dayEnd,
          reason: `Correction ${row.id}: ${row.reason}`,
        },
      });
    } else {
      const inAt = new Date(
        applied && typeof applied === "object" && "in_at" in applied && applied.in_at
          ? String(applied.in_at)
          : row.proposedStart.toISOString(),
      );
      const outAt = new Date(
        applied && typeof applied === "object" && "out_at" in applied && applied.out_at
          ? String(applied.out_at)
          : row.proposedEnd.toISOString(),
      );
      const officeId =
        applied && typeof applied === "object" && "office_id" in applied
          ? applied.office_id
            ? String(applied.office_id)
            : null
          : row.officeLocationId;
      const office = officeId
        ? await prisma.officeLocation.findUnique({ where: { id: officeId } })
        : null;
      const visit = await prisma.visit.create({
        data: {
          userId: row.userId,
          startAt: inAt,
          endAt: outAt,
          source: "correction",
          reason: `Correction: ${row.reason}`,
          editedBy: actorId,
          officeLocationId: office?.id ?? null,
          pointsAwarded: office?.pointsPerVisitDay ?? 0,
          correctionId: row.id,
        },
      });
      visitId = visit.id;
    }
  }

  const updated = await prisma.visitCorrectionRequest.update({
    where: { id: row.id },
    data: {
      status: decision === "approve" ? "approved" : "rejected",
      reviewedById: actorId,
      reviewedAt: new Date(),
      reviewNote,
      applied:
        decision === "approve" && applied != null
          ? (applied as Prisma.InputJsonValue)
          : undefined,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId,
      action: `correction.${decision}`,
      targetType: "VisitCorrectionRequest",
      targetId: row.id,
      beforeJson: row as unknown as Prisma.InputJsonValue,
      afterJson: { ...updated, visitId } as unknown as Prisma.InputJsonValue,
      reason: reviewNote ?? undefined,
    },
  });
  if (decision === "approve") await recomputeUserPresence(row.userId);
  return { request: updated, visitId };
}
