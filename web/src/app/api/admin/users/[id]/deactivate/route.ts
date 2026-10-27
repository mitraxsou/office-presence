import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";
import { isSelfGuardBlocked, wouldRemoveLastAdmin } from "@/lib/users-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;

  if (isSelfGuardBlocked(actor.user.id, id)) {
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.deactivatedAt) {
    return NextResponse.json({ ok: true, user: { id, deactivatedAt: target.deactivatedAt } });
  }

  if (target.role === "admin") {
    const otherAdmins = await prisma.user.count({
      where: { role: "admin", deactivatedAt: null, id: { not: id } },
    });
    if (
      wouldRemoveLastAdmin({
        targetRole: target.role,
        deactivating: true,
        otherActiveAdminCount: otherAdmins,
      })
    ) {
      return NextResponse.json({ error: "Cannot deactivate the last admin" }, { status: 400 });
    }
  }

  const now = new Date();
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deactivatedAt: now },
      select: { id: true, email: true, deactivatedAt: true },
    }),
    prisma.deviceToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.viewAsSession.updateMany({
      where: {
        endedAt: null,
        OR: [{ targetUserId: id }, { adminId: id }],
      },
      data: { endedAt: now },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.user.id,
        action: "user.deactivate",
        targetType: "User",
        targetId: id,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, user });
}
