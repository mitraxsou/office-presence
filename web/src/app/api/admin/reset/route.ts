import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const body = await request.json().catch(() => ({}));
  const userId = body.userId ? String(body.userId) : null;
  const confirm = String(body.confirm ?? "");
  if (confirm !== "RESET") {
    return NextResponse.json({ error: "confirm must be RESET" }, { status: 400 });
  }
  const where = userId ? { userId } : {};
  const [events, visits, exclusions, alerts, statuses] = await prisma.$transaction([
    prisma.presenceEvent.deleteMany({ where }),
    prisma.visit.deleteMany({ where }),
    prisma.visitExclusion.deleteMany({ where }),
    prisma.pendingAlert.deleteMany({ where }),
    userId
      ? prisma.currentStatus.deleteMany({ where: { userId } })
      : prisma.currentStatus.deleteMany({}),
  ]);
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "presence.reset",
      targetType: userId ? "user" : "all",
      targetId: userId,
      afterJson: { events: events.count, visits: visits.count, exclusions: exclusions.count, alerts: alerts.count, statuses: statuses.count },
      reason: body.reason ? String(body.reason) : "admin reset",
    },
  });
  return NextResponse.json({
    ok: true,
    deleted: {
      events: events.count,
      visits: visits.count,
      exclusions: exclusions.count,
      alerts: alerts.count,
      statuses: statuses.count,
    },
  });
}
