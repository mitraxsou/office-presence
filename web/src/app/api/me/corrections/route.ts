import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const rows = await prisma.visitCorrectionRequest.findMany({
    where: { userId: actor.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ requests: rows });
}

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const dayKey = String(body.dayKey ?? "");
  const proposedStart = new Date(body.proposedStart);
  const proposedEnd = new Date(body.proposedEnd);
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  const officeLocationId = body.officeLocationId ? String(body.officeLocationId) : null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) ||
    !reason ||
    Number.isNaN(proposedStart.getTime()) ||
    Number.isNaN(proposedEnd.getTime())
  ) {
    return NextResponse.json({ error: "dayKey, proposedStart, proposedEnd, reason required" }, { status: 400 });
  }
  if (proposedEnd <= proposedStart) {
    return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
  }
  if (officeLocationId) {
    const office = await prisma.officeLocation.findUnique({ where: { id: officeLocationId } });
    if (!office) return NextResponse.json({ error: "Office not found" }, { status: 404 });
  }
  const row = await prisma.visitCorrectionRequest.create({
    data: { userId: actor.user.id, dayKey, proposedStart, proposedEnd, reason, officeLocationId },
  });
  await prisma.auditLog.create({
    data: { actorId: actor.user.id, action: "correction.request", targetType: "VisitCorrectionRequest", targetId: row.id, afterJson: row },
  });
  return NextResponse.json({ request: row });
}
