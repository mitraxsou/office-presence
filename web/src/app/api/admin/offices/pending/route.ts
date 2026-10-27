import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (res) { return res as Response; }
  const body = await request.json();
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  if (!id || !["approve", "reject"].includes(decision)) {
    return NextResponse.json({ error: "id and decision required" }, { status: 400 });
  }
  const before = await prisma.officeLocation.findUnique({ where: { id } });
  if (!before || before.status !== "pending") {
    return NextResponse.json({ error: "Pending office not found" }, { status: 404 });
  }
  const points = Number(body.pointsPerVisitDay);
  const office = await prisma.officeLocation.update({
    where: { id },
    data: {
      ...(decision === "approve" && Number.isInteger(points) && points >= 0 && points <= 100
        ? { pointsPerVisitDay: points }
        : {}),
      ...(decision === "approve" && typeof body.name === "string" && body.name.trim()
        ? { name: body.name.trim().slice(0, 80) }
        : {}),
      status: decision === "approve" ? "active" : "rejected",
      approvedByAdminId: admin.id,
      approvedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: { actorId: admin.id, action: `office.${decision}`, targetType: "OfficeLocation", targetId: id, beforeJson: before, afterJson: office },
  });
  return NextResponse.json({ office });
}
