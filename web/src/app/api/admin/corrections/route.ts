import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recomputeUserPresence } from "@/lib/presence";

export async function GET(request: Request) {
  try { await requireAdmin(); } catch (res) { return res as Response; }
  const sp = new URL(request.url).searchParams;
  const status = (sp.get("status") ?? "pending") as "pending" | "approved" | "rejected";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(sp.get("pageSize") ?? 20)));
  const where = { status };
  const [requests, total, offices] = await Promise.all([
    prisma.visitCorrectionRequest.findMany({
      where,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: status === "pending" ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.visitCorrectionRequest.count({ where }),
    prisma.officeLocation.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(offices.map((o) => [o.id, o.name]));
  return NextResponse.json({
    requests: requests.map((r) => ({ ...r, officeName: r.officeLocationId ? names.get(r.officeLocationId) ?? null : null })),
    pagination: { page, pageSize, total },
  });
}

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (res) { return res as Response; }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  const reviewNote = body.reviewNote ? String(body.reviewNote).slice(0, 500) : null;
  if (!id || !["approve", "reject"].includes(decision)) {
    return NextResponse.json({ error: "id and decision required" }, { status: 400 });
  }
  const row = await prisma.visitCorrectionRequest.findUnique({ where: { id } });
  if (!row || row.status !== "pending") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let visitId: string | null = null;
  if (decision === "approve") {
    const office = row.officeLocationId
      ? await prisma.officeLocation.findUnique({ where: { id: row.officeLocationId } })
      : null;
    const visit = await prisma.visit.create({
      data: {
        userId: row.userId,
        startAt: row.proposedStart,
        endAt: row.proposedEnd,
        source: "admin",
        reason: `Correction: ${row.reason}`,
        editedBy: admin.id,
        officeLocationId: office?.id ?? null,
        pointsAwarded: office?.pointsPerVisitDay ?? 0,
      },
    });
    visitId = visit.id;
  }
  const updated = await prisma.visitCorrectionRequest.update({
    where: { id },
    data: {
      status: decision === "approve" ? "approved" : "rejected",
      reviewedById: admin.id,
      reviewedAt: new Date(),
      reviewNote,
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
