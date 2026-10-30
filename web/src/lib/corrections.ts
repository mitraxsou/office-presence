import type { Prisma, VisitCorrectionRequest } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeUserMonth, recomputeUserPresence } from "@/lib/presence";
import {
  emptyKept,
  isMonthLocked,
  readKeptDayRows,
  retainOutsideRange,
  withKeptDayRows,
  type KeptDayRows,
} from "@/lib/corrections-rules";
import { classifyCorrection, futureTimeError, type ClassifyResult, type VisitTime } from "@/lib/correction-approval";
import { officeIdsOnRequest, pointsForCorrectionOffices } from "@/lib/correction-request";
import { getPolicy } from "@/lib/policy";
import { localDayBounds } from "@/lib/visit-calculator";

export type CorrectionIssue = "missing_visit" | "wrong_times" | "wrong_office" | "should_not_count";

export type VisitRequest = { office_id: string | null; in_at: string; out_at: string | null };

export type RequestedSnapshot =
  | { remove: true }
  | VisitRequest
  | { visits: VisitRequest[] };

export function visitTimes(requested: RequestedSnapshot): VisitTime[] {
  if ("remove" in requested) return [];
  if ("visits" in requested) {
    return requested.visits.map((v) => ({ inAt: v.in_at, outAt: v.out_at }));
  }
  return [{ inAt: requested.in_at, outAt: requested.out_at }];
}

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

  const officeIds = officeIdsOnRequest(requested);
  let add = 0;
  if (officeIds.length) {
    const offices = await prisma.officeLocation.findMany({
      where: { id: { in: officeIds } },
      select: { pointsPerVisitDay: true },
    });
    add = pointsForCorrectionOffices(offices.map((o) => o.pointsPerVisitDay ?? 0));
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

export async function judgeCorrection(userId: string, role: string, dayKey: string): Promise<ClassifyResult> {
  const policy = await getPolicy();
  const month = dayKey.slice(0, 7);
  const [autoApprovedThisMonth, user] = await Promise.all([
    prisma.visitCorrectionRequest.count({
      where: { userId, autoApproved: true, dayKey: { startsWith: `${month}-` } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);
  const tz = user?.timezone || policy.timezone;
  const bounds = localDayBounds(dayKey, tz);
  const samples = await prisma.presenceEvent.count({
    where: {
      userId,
      simulated: false,
      recordedAt: { gte: new Date(bounds.startMs), lt: new Date(bounds.endMs) },
    },
  });
  return classifyCorrection({
    requiresApproval: policy.correctionRequiresApproval === true,
    isAdminSelf: role === "admin",
    autoApprovedThisMonth,
    limit: policy.correctionAutoApproveLimit ?? 4,
    requireSync: policy.correctionRequireSync !== false,
    hasPhoneData: samples > 0,
  });
}

export async function decideCorrection(opts: {
  row: VisitCorrectionRequest;
  actorId: string | null;
  decision: "approve" | "reject";
  applied: unknown;
  reviewNote: string | null;
  /** System apply. Does not set reviewedById to the requester. */
  asAuto?: boolean;
}) {
  const { row, actorId, decision, reviewNote } = opts;
  const applied = opts.applied ?? row.requested ?? null;
  let visitId: string | null = null;
  let keptRows: KeptDayRows | null = null;

  if (decision === "approve") {
    const remove = applied && typeof applied === "object" && "remove" in applied && applied.remove === true;
    const shouldRemove = remove || row.issue === "should_not_count";
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone || "Asia/Kolkata";
    const bounds = localDayBounds(row.dayKey, timezone);
    const dayStart = new Date(bounds.startMs);
    const dayEnd = new Date(bounds.endMs);

    const now = new Date();
    const rawVisits = visitsFromApplied(applied, row);
    const stillIn = rawVisits.some((v) => v.outAt == null);
    const replacements: Array<{
      startAt: Date;
      endAt: Date;
      officeLocationId: string | null;
      pointsAwarded: number;
    }> = [];
    if (!shouldRemove) {
      for (const v of rawVisits) {
        const office = v.officeId
          ? await prisma.officeLocation.findUnique({ where: { id: v.officeId } })
          : null;
        const startAt = new Date(v.inAt);
        const endAt = v.outAt ? new Date(v.outAt) : now;
        replacements.push({
          startAt,
          endAt,
          officeLocationId: office?.id ?? null,
          pointsAwarded: office?.pointsPerVisitDay ?? 0,
        });
      }
    }

    keptRows = await prisma.$transaction(async (tx) => {
      const kept = emptyKept();
      const storedVisits = (
        await tx.visit.findMany({
          where: {
            userId: row.userId,
            source: { in: ["admin", "correction"] },
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
          },
        })
      ).filter((visit) => visit.endAt);
      if (storedVisits.length) {
        await tx.visit.deleteMany({ where: { id: { in: storedVisits.map((visit) => visit.id) } } });
        for (const visit of storedVisits) {
          if (!visit.endAt) continue;
          kept.visits.push({
            id: visit.id,
            startAt: visit.startAt.toISOString(),
            endAt: visit.endAt.toISOString(),
            source: visit.source,
            reason: visit.reason,
            editedBy: visit.editedBy,
            officeLocationId: visit.officeLocationId,
            pointsAwarded: visit.pointsAwarded,
            correctionId: visit.correctionId,
          });
          const retained = retainOutsideRange(visit.startAt, visit.endAt, dayStart, dayEnd);
          for (const part of retained) {
            const created = await tx.visit.create({
              data: {
                userId: visit.userId,
                startAt: part.startAt,
                endAt: part.endAt,
                source: visit.source,
                reason: visit.reason,
                editedBy: visit.editedBy,
                officeLocationId: visit.officeLocationId,
                pointsAwarded: visit.pointsAwarded,
                correctionId: visit.correctionId,
              },
            });
            kept.fragmentVisitIds.push(created.id);
          }
        }
      }

      const oldExclusions = await tx.visitExclusion.findMany({
        where: {
          userId: row.userId,
          startAt: { lt: dayEnd },
          endAt: { gt: dayStart },
        },
      });
      if (oldExclusions.length) {
        await tx.visitExclusion.deleteMany({
          where: { id: { in: oldExclusions.map((exclusion) => exclusion.id) } },
        });
        for (const exclusion of oldExclusions) {
          kept.exclusions.push({
            id: exclusion.id,
            startAt: exclusion.startAt.toISOString(),
            endAt: exclusion.endAt.toISOString(),
            reason: exclusion.reason,
          });
          const retained = retainOutsideRange(exclusion.startAt, exclusion.endAt, dayStart, dayEnd);
          for (const part of retained) {
            const created = await tx.visitExclusion.create({
              data: {
                userId: exclusion.userId,
                startAt: part.startAt,
                endAt: part.endAt,
                reason: exclusion.reason,
              },
            });
            kept.fragmentExclusionIds.push(created.id);
          }
        }
      }

      if (shouldRemove) {
        await tx.visitExclusion.create({
          data: {
            userId: row.userId,
            startAt: dayStart,
            endAt: dayEnd,
            reason: `Correction ${row.id}: ${row.reason}`,
          },
        });
      } else if (replacements.length) {
        await tx.visitExclusion.create({
          data: {
            userId: row.userId,
            startAt: dayStart,
            endAt: stillIn ? now : dayEnd,
            reason: `Correction ${row.id}: ${row.reason}`,
          },
        });
        for (const replacement of replacements) {
          const visit = await tx.visit.create({
            data: {
              userId: row.userId,
              startAt: replacement.startAt,
              endAt: replacement.endAt,
              source: "correction",
              reason: `Correction: ${row.reason}`,
              editedBy: actorId,
              officeLocationId: replacement.officeLocationId,
              pointsAwarded: replacement.pointsAwarded,
              correctionId: row.id,
            },
          });
          visitId = visit.id;
        }
      }
      return kept;
    });
  }

  const asAuto = opts.asAuto === true && decision === "approve";
  const updated = await prisma.visitCorrectionRequest.update({
    where: { id: row.id },
    data: {
      status: decision === "reject" ? "rejected" : asAuto ? "auto_approved" : "approved",
      autoApproved: asAuto ? true : undefined,
      pendingReason: asAuto ? null : undefined,
      reviewedById: asAuto ? null : actorId,
      reviewedAt: new Date(),
      reviewNote,
      applied:
        decision === "approve"
          ? (withKeptDayRows(applied ?? row.requested ?? {}, keptRows ?? emptyKept()) as Prisma.InputJsonValue)
          : undefined,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actorId ?? row.userId,
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

function visitsFromApplied(
  applied: unknown,
  row: VisitCorrectionRequest,
): Array<{ inAt: string; outAt: string | null; officeId: string | null }> {
  if (applied && typeof applied === "object" && "visits" in applied && Array.isArray(applied.visits)) {
    return applied.visits.map((v) => {
      const item = v as VisitRequest;
      return {
        inAt: String(item.in_at),
        outAt: item.out_at == null || item.out_at === "" ? null : String(item.out_at),
        officeId: item.office_id ? String(item.office_id) : null,
      };
    });
  }
  const obj = applied && typeof applied === "object" ? (applied as VisitRequest) : null;
  return [
    {
      inAt: obj?.in_at ? String(obj.in_at) : row.proposedStart.toISOString(),
      outAt: obj && "out_at" in obj && (obj.out_at == null || obj.out_at === "")
        ? null
        : obj?.out_at
          ? String(obj.out_at)
          : row.proposedEnd.toISOString(),
      officeId: obj?.office_id ? String(obj.office_id) : row.officeLocationId,
    },
  ];
}

async function laterAppliedCorrection(row: VisitCorrectionRequest) {
  return prisma.visitCorrectionRequest.findFirst({
    where: {
      userId: row.userId,
      dayKey: row.dayKey,
      id: { not: row.id },
      status: { in: ["approved", "auto_approved"] },
      createdAt: { gt: row.createdAt },
    },
    select: { id: true },
  });
}

async function clearAppliedCorrection(row: VisitCorrectionRequest) {
  const kept = readKeptDayRows(row.applied);
  await prisma.$transaction(async (tx) => {
    await tx.visit.deleteMany({ where: { correctionId: row.id } });
    await tx.visitExclusion.deleteMany({
      where: { userId: row.userId, reason: { startsWith: `Correction ${row.id}` } },
    });
    if (!kept) return;
    if (kept.fragmentVisitIds.length) {
      await tx.visit.deleteMany({ where: { id: { in: kept.fragmentVisitIds } } });
    }
    if (kept.fragmentExclusionIds.length) {
      await tx.visitExclusion.deleteMany({ where: { id: { in: kept.fragmentExclusionIds } } });
    }
    for (const visit of kept.visits) {
      await tx.visit.create({
        data: {
          id: visit.id,
          userId: row.userId,
          startAt: new Date(visit.startAt),
          endAt: new Date(visit.endAt),
          source: visit.source,
          reason: visit.reason,
          editedBy: visit.editedBy,
          officeLocationId: visit.officeLocationId,
          pointsAwarded: visit.pointsAwarded,
          correctionId: visit.correctionId,
        },
      });
    }
    for (const exclusion of kept.exclusions) {
      await tx.visitExclusion.create({
        data: {
          id: exclusion.id,
          userId: row.userId,
          startAt: new Date(exclusion.startAt),
          endAt: new Date(exclusion.endAt),
          reason: exclusion.reason,
        },
      });
    }
  });
  await recomputeUserPresence(row.userId);
}

export async function undoOwnCorrection(row: VisitCorrectionRequest, actorId: string) {
  if (row.userId !== actorId || row.status !== "auto_approved") {
    return { ok: false as const, error: "Not found", status: 404 };
  }
  const policy = await getPolicy();
  if (isMonthLocked(row.dayKey, policy.correctionWindowDays ?? 5)) {
    return { ok: false as const, error: "This month is locked", status: 400 };
  }
  if (await laterAppliedCorrection(row)) {
    return { ok: false as const, error: "A later correction for this day is still applied", status: 400 };
  }
  await clearAppliedCorrection(row);
  const updated = await prisma.visitCorrectionRequest.update({
    where: { id: row.id },
    data: { status: "undone", reviewNote: "Undone by you" },
  });
  return { ok: true as const, request: updated };
}

export async function revertCorrection(row: VisitCorrectionRequest, adminId: string, note: string) {
  if (row.status !== "auto_approved" && row.status !== "approved") {
    return { ok: false as const, error: "Not found", status: 404 };
  }
  if (!note.trim()) return { ok: false as const, error: "Note required", status: 400 };
  if (row.userId === adminId) {
    return { ok: false as const, error: "Admins cannot decide their own correction requests", status: 403 };
  }
  if (await laterAppliedCorrection(row)) {
    return { ok: false as const, error: "A later correction for this day is still applied", status: 400 };
  }
  await clearAppliedCorrection(row);
  const updated = await prisma.visitCorrectionRequest.update({
    where: { id: row.id },
    data: {
      status: "reverted",
      reviewedById: adminId,
      reviewedAt: new Date(),
      reviewNote: note.trim().slice(0, 500),
    },
  });
  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (user) {
    const { sendTeamsNotification } = await import("@/lib/notifications");
    await sendTeamsNotification({
      type: "custom",
      email: user.email,
      name: user.name ?? user.email,
      message: `An admin reverted your correction for ${row.dayKey}. ${note.trim()}`,
    });
  }
  return { ok: true as const, request: updated };
}
