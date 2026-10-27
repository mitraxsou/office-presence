import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recomputeUserPresence } from "@/lib/presence";

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const body = await request.json();
  const userId = String(body.userId ?? "");
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  const reason = String(body.reason ?? "").trim();
  if (!userId || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || !reason) {
    return NextResponse.json({ error: "userId, startAt, endAt, reason required" }, { status: 400 });
  }
  const office = body.officeLocationId
    ? await prisma.officeLocation.findUnique({ where: { id: String(body.officeLocationId) } })
    : null;
  const visit = await prisma.visit.create({
    data: {
      userId,
      startAt,
      endAt,
      source: "admin",
      reason,
      editedBy: admin.id,
      officeLocationId: office?.id ?? null,
      pointsAwarded: office?.pointsPerVisitDay ?? 0,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "visit.create",
      targetType: "visit",
      targetId: visit.id,
      afterJson: visit,
      reason,
    },
  });
  await recomputeUserPresence(userId);
  return NextResponse.json({ visit });
}

export async function PATCH(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const body = await request.json();
  const id = String(body.id ?? "");
  const reason = String(body.reason ?? "").trim();
  if (!id || !reason) {
    return NextResponse.json({ error: "id and reason required" }, { status: 400 });
  }
  const before = await prisma.visit.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const visit = await prisma.visit.update({
    where: { id },
    data: {
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
      source: "admin",
      reason,
      editedBy: admin.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "visit.update",
      targetType: "visit",
      targetId: id,
      beforeJson: before,
      afterJson: visit,
      reason,
    },
  });
  await recomputeUserPresence(before.userId);
  return NextResponse.json({ visit });
}

export async function DELETE(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const body = await request.json();
  const id = String(body.id ?? "");
  const reason = String(body.reason ?? "").trim();
  if (!id || !reason) {
    return NextResponse.json({ error: "id and reason required" }, { status: 400 });
  }
  const before = await prisma.visit.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.endAt) {
    await prisma.visitExclusion.create({
      data: {
        userId: before.userId,
        startAt: before.startAt,
        endAt: before.endAt,
        reason,
      },
    });
  }
  await prisma.visit.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "visit.delete",
      targetType: "visit",
      targetId: id,
      beforeJson: before,
      reason,
    },
  });
  await recomputeUserPresence(before.userId);
  return NextResponse.json({ ok: true });
}
