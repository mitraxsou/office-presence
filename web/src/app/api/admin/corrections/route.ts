import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recomputeUserPresence } from "@/lib/presence";
import { previewEffect, type RequestedSnapshot } from "@/lib/corrections";
import { canDecideOwnCorrection } from "@/lib/corrections-rules";
import { phoneSyncPerDevice } from "@/lib/phone-sync";
import { getPolicy } from "@/lib/policy";
import { monthKeyInTz } from "@/lib/presence";
import type { CorrectionStatus, Prisma } from "@prisma/client";

const STATUS_TABS = ["pending", "approved", "rejected", "cancelled", "all"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

function requestedBounds(r: {
  requested: unknown;
  proposedStart: Date;
  proposedEnd: Date;
}): { inAt: Date; outAt: Date; snapshot: RequestedSnapshot } {
  const requested = (r.requested as RequestedSnapshot | null) ?? {
    office_id: null,
    in_at: r.proposedStart.toISOString(),
    out_at: r.proposedEnd.toISOString(),
  };
  if ("remove" in requested && requested.remove) {
    return { inAt: r.proposedStart, outAt: r.proposedEnd, snapshot: requested };
  }
  const inAt = new Date(
    "in_at" in requested && requested.in_at ? String(requested.in_at) : r.proposedStart.toISOString(),
  );
  const outAt = new Date(
    "out_at" in requested && requested.out_at ? String(requested.out_at) : r.proposedEnd.toISOString(),
  );
  return { inAt, outAt, snapshot: requested };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const sp = new URL(request.url).searchParams;
  if (sp.get("count") === "1") {
    const pending = await prisma.visitCorrectionRequest.count({ where: { status: "pending" } });
    return NextResponse.json({ pending });
  }

  const statusRaw = (sp.get("status") ?? "pending").toLowerCase();
  const statusTab: StatusTab = STATUS_TABS.includes(statusRaw as StatusTab)
    ? (statusRaw as StatusTab)
    : "pending";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(sp.get("pageSize") ?? 20)));
  const office = sp.get("office")?.trim() || "";
  const q = sp.get("q")?.trim().toLowerCase() || "";

  const policy = await getPolicy();
  const monthKey = monthKeyInTz(new Date(), policy.timezone);
  const monthPrefix = `${monthKey}-`;

  const where: Prisma.VisitCorrectionRequestWhereInput = {};
  if (statusTab !== "all") {
    where.status = statusTab as CorrectionStatus;
  }
  if (office) {
    const matched = await prisma.officeLocation.findMany({
      where: {
        OR: [{ id: office }, { name: { contains: office, mode: "insensitive" } }],
      },
      select: { id: true },
    });
    where.officeLocationId = { in: matched.length ? matched.map((o) => o.id) : ["__none__"] };
  }
  if (q) {
    where.user = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const [requests, total, offices, pendingCount, approvedCount, rejectedCount, oldestPending, activeAdminCount] =
    await Promise.all([
    prisma.visitCorrectionRequest.findMany({
      where,
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: statusTab === "pending" ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.visitCorrectionRequest.count({ where }),
    prisma.officeLocation.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.visitCorrectionRequest.count({
      where: { status: "pending", dayKey: { startsWith: monthPrefix } },
    }),
    prisma.visitCorrectionRequest.count({
      where: { status: "approved", dayKey: { startsWith: monthPrefix } },
    }),
    prisma.visitCorrectionRequest.count({
      where: { status: "rejected", dayKey: { startsWith: monthPrefix } },
    }),
    prisma.visitCorrectionRequest.findFirst({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.user.count({ where: { role: "admin", deactivatedAt: null } }),
  ]);
  const oldestPendingDays = oldestPending
    ? Math.max(0, Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 86_400_000))
    : null;
  const names = new Map(offices.map((o) => [o.id, o.name]));
  const withEffect = await Promise.all(
    requests.map(async (r) => {
      const { inAt, outAt, snapshot } = requestedBounds(r);
      const effect = await previewEffect(r.userId, r.dayKey, snapshot);
      const dayStart = new Date(`${r.dayKey}T00:00:00.000Z`);
      const dayEnd = new Date(`${r.dayKey}T23:59:59.999Z`);
      const syncEvents = await prisma.presenceEvent.findMany({
        where: {
          userId: r.userId,
          recordedAt: { gte: dayStart, lte: dayEnd },
        },
        select: { recordedAt: true, deviceName: true, deviceTokenId: true },
        orderBy: { recordedAt: "asc" },
        take: 500,
      });
      return {
        ...r,
        officeName: r.officeLocationId ? names.get(r.officeLocationId) ?? null : null,
        effect,
        phoneSync: phoneSyncPerDevice(syncEvents, inAt, outAt),
      };
    }),
  );
  return NextResponse.json({
    requests: withEffect,
    pagination: { page, pageSize, total },
    offices,
    canDecideOwn: canDecideOwnCorrection(activeAdminCount),
    counts: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      month: monthKey,
      oldestPendingDays,
      correctionWindowDays: policy.correctionWindowDays ?? 5,
      activeAdminCount,
    },
  });
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  const reviewNote = body.reviewNote != null ? String(body.reviewNote).trim().slice(0, 500) : null;
  if (!id || !["approve", "reject"].includes(decision)) {
    return NextResponse.json({ error: "id and decision required" }, { status: 400 });
  }
  const row = await prisma.visitCorrectionRequest.findUnique({ where: { id } });
  if (!row || row.status !== "pending") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.userId === admin.id) {
    const activeAdminCount = await prisma.user.count({
      where: { role: "admin", deactivatedAt: null },
    });
    if (!canDecideOwnCorrection(activeAdminCount)) {
      return NextResponse.json(
        { error: "Admins cannot decide their own correction requests" },
        { status: 403 },
      );
    }
  }
  if (decision === "reject" && !reviewNote) {
    return NextResponse.json({ error: "Reject note required" }, { status: 400 });
  }

  let visitId: string | null = null;
  const applied = body.applied ?? row.requested ?? null;

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
        (applied && typeof applied === "object" && "in_at" in applied && applied.in_at
          ? String(applied.in_at)
          : row.proposedStart.toISOString()),
      );
      const outAt = new Date(
        (applied && typeof applied === "object" && "out_at" in applied && applied.out_at
          ? String(applied.out_at)
          : row.proposedEnd.toISOString()),
      );
      const officeId =
        applied && typeof applied === "object" && "office_id" in applied
          ? (applied.office_id ? String(applied.office_id) : null)
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
          editedBy: admin.id,
          officeLocationId: office?.id ?? null,
          pointsAwarded: office?.pointsPerVisitDay ?? 0,
          correctionId: row.id,
        },
      });
      visitId = visit.id;
    }
  }

  const updated = await prisma.visitCorrectionRequest.update({
    where: { id },
    data: {
      status: decision === "approve" ? "approved" : "rejected",
      reviewedById: admin.id,
      reviewedAt: new Date(),
      reviewNote,
      applied: decision === "approve" ? applied : undefined,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: `correction.${decision}`,
      targetType: "VisitCorrectionRequest",
      targetId: id,
      beforeJson: row,
      afterJson: { ...updated, visitId },
      reason: reviewNote ?? undefined,
    },
  });
  if (decision === "approve") await recomputeUserPresence(row.userId);
  return NextResponse.json({ request: updated });
}
