import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";
import { clearViewAsCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => ({}));
  const sessionId = body.sessionId != null ? String(body.sessionId) : null;
  const now = new Date();

  let ended = 0;
  if (sessionId) {
    const row = await prisma.viewAsSession.findFirst({
      where: { id: sessionId, adminId: actor.user.id, endedAt: null },
    });
    if (row) {
      await prisma.viewAsSession.update({ where: { id: row.id }, data: { endedAt: now } });
      ended = 1;
      await prisma.auditLog.create({
        data: {
          actorId: actor.user.id,
          action: "view_as.end",
          targetType: "ViewAsSession",
          targetId: row.id,
        },
      });
    }
  } else {
    const result = await prisma.viewAsSession.updateMany({
      where: { adminId: actor.user.id, endedAt: null },
      data: { endedAt: now },
    });
    ended = result.count;
    if (ended > 0) {
      await prisma.auditLog.create({
        data: {
          actorId: actor.user.id,
          action: "view_as.end",
          targetType: "User",
          targetId: actor.user.id,
          afterJson: { ended },
        },
      });
    }
  }

  await clearViewAsCookie();
  return NextResponse.json({ ok: true, ended });
}
