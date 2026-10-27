import { prisma } from "@/lib/db";
import { computeUserMonth, recomputeUserPresence } from "@/lib/presence";
import { localDayBounds } from "@/lib/visit-calculator";

export type AdminVisitInput = {
  id?: string;
  office_id: string | null;
  in_at: string;
  out_at: string;
};

export async function assertNotSelfEdit(adminId: string, userId: string) {
  if (adminId === userId) {
    return { ok: false as const, error: "Admins cannot edit their own visits", status: 403 };
  }
  return { ok: true as const };
}

/** Replace all visits for a local day with admin visits. Closes pending corrections. */
export async function putPersonDay(args: {
  adminId: string;
  userId: string;
  dayKey: string;
  visits: AdminVisitInput[];
  counted: boolean;
  reason: string;
  notify: boolean;
}) {
  const { adminId, userId, dayKey, visits, counted, reason, notify } = args;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false as const, error: "User not found", status: 404 };
  const tz = user.timezone || "Asia/Kolkata";
  const { startMs, endMs } = localDayBounds(dayKey, tz);
  const dayStart = new Date(startMs);
  const dayEnd = new Date(endMs);

  const beforeMonth = await computeUserMonth(userId, dayKey.slice(0, 7));
  const beforeDay = beforeMonth.days.find((d) => d.dayKey === dayKey);
  const before = {
    points: beforeDay?.points ?? 0,
    hours: beforeDay?.hours ?? 0,
    intervals: beforeDay?.intervals ?? [],
    offices: beforeDay?.offices ?? [],
  };

  // Suppress auto visits for the day; admin visits replace them.
  await prisma.visitExclusion.deleteMany({
    where: { userId, startAt: dayStart, endAt: dayEnd },
  });
  await prisma.visitExclusion.create({
    data: {
      userId,
      startAt: dayStart,
      endAt: dayEnd,
      reason: `Admin day edit: ${reason}`,
    },
  });

  // Remove prior admin/correction visits that land on this day.
  const existing = await prisma.visit.findMany({
    where: {
      userId,
      source: { in: ["admin", "correction"] },
      startAt: { lt: dayEnd },
      endAt: { gte: dayStart },
    },
  });
  if (existing.length) {
    await prisma.visit.deleteMany({ where: { id: { in: existing.map((v) => v.id) } } });
  }

  const officeIds = [...new Set(visits.map((v) => v.office_id).filter(Boolean))] as string[];
  const offices = officeIds.length
    ? await prisma.officeLocation.findMany({ where: { id: { in: officeIds } } })
    : [];
  const officeById = new Map(offices.map((o) => [o.id, o]));

  const created = [];
  for (const v of visits) {
    const inAt = new Date(v.in_at);
    const outAt = new Date(v.out_at);
    if (Number.isNaN(inAt.getTime()) || Number.isNaN(outAt.getTime()) || outAt <= inAt) {
      return { ok: false as const, error: "Each visit needs valid In and Out on the same day", status: 400 };
    }
    const office = v.office_id ? officeById.get(v.office_id) : null;
    const points = counted ? (office?.pointsPerVisitDay ?? 1) : 0;
    const row = await prisma.visit.create({
      data: {
        userId,
        startAt: inAt,
        endAt: outAt,
        source: "admin",
        reason,
        editedBy: adminId,
        officeLocationId: office?.id ?? null,
        pointsAwarded: points,
      },
    });
    created.push(row);
  }

  const pending = await prisma.visitCorrectionRequest.findMany({
    where: { userId, dayKey, status: "pending" },
  });
  if (pending.length) {
    await prisma.visitCorrectionRequest.updateMany({
      where: { id: { in: pending.map((r) => r.id) } },
      data: {
        status: "cancelled",
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: "Resolved by admin",
      },
    });
  }

  await recomputeUserPresence(userId);
  const afterMonth = await computeUserMonth(userId, dayKey.slice(0, 7));
  const afterDay = afterMonth.days.find((d) => d.dayKey === dayKey);
  const after = {
    points: afterDay?.points ?? 0,
    hours: afterDay?.hours ?? 0,
    intervals: afterDay?.intervals ?? [],
    offices: afterDay?.offices ?? [],
  };

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "person.day.edit",
      targetType: "user",
      targetId: userId,
      beforeJson: before,
      afterJson: {
        ...after,
        dayKey,
        counted,
        visits: created.map((v) => ({
          id: v.id,
          officeLocationId: v.officeLocationId,
          startAt: v.startAt.toISOString(),
          endAt: v.endAt?.toISOString() ?? null,
          pointsAwarded: v.pointsAwarded,
        })),
        pendingClosed: pending.map((r) => r.id),
        notify,
      },
      reason,
    },
  });

  // Notify is best-effort via existing Teams path when requested.
  if (notify) {
    try {
      const { sendTeamsNotification } = await import("@/lib/notifications");
      await sendTeamsNotification({
        type: "custom",
        email: user.email,
        name: user.name || user.email.split("@")[0],
        message: `An admin updated your ${dayKey} visits. Open My month to review.`,
      });
    } catch {
      /* ignore notify failures */
    }
  }

  return {
    ok: true as const,
    day: afterDay ?? null,
    monthPoints: afterMonth.summary.points,
    pointsTarget: afterMonth.summary.target,
    pendingClosed: pending.length,
    daysBefore: beforeMonth.summary.points,
    daysAfter: afterMonth.summary.points,
  };
}

export async function addPersonVisit(args: {
  adminId: string;
  userId: string;
  dayKey: string;
  office_id: string | null;
  in_at: string;
  out_at: string;
  reason: string;
  notify: boolean;
}) {
  return putPersonDay({
    adminId: args.adminId,
    userId: args.userId,
    dayKey: args.dayKey,
    visits: [{ office_id: args.office_id, in_at: args.in_at, out_at: args.out_at }],
    counted: true,
    reason: args.reason,
    notify: args.notify,
  });
}

export async function listPersonHistory(userId: string, month?: string) {
  const logs = await prisma.auditLog.findMany({
    where: {
      targetType: "user",
      targetId: userId,
      action: { in: ["person.day.edit", "visit.create", "visit.update", "visit.delete", "correction.approve", "correction.reject"] },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { id: true, name: true, email: true } } },
  });
  const filtered = month
    ? logs.filter((l) => {
        const after = l.afterJson as { dayKey?: string } | null;
        const day = after?.dayKey;
        return !day || day.startsWith(month);
      })
    : logs;
  return filtered.map((l) => {
    const after = (l.afterJson ?? {}) as Record<string, unknown>;
    const before = (l.beforeJson ?? {}) as Record<string, unknown>;
    return {
      actor: l.actor?.name || l.actor?.email || "Admin",
      at: l.createdAt.toISOString(),
      day: typeof after.dayKey === "string" ? after.dayKey : null,
      action: l.action,
      before,
      after,
      reason: l.reason,
    };
  });
}
