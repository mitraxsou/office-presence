import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, deactivatedAt: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!target.deactivatedAt) {
    return NextResponse.json({ ok: true, user: { id, deactivatedAt: null } });
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deactivatedAt: null },
      select: { id: true, email: true, deactivatedAt: true },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.user.id,
        action: "user.reactivate",
        targetType: "User",
        targetId: id,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, user });
}
