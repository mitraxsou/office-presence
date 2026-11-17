import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const data: { name?: string; leadUserId?: string | null } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    const clash = await prisma.team.findFirst({
      where: { id: { not: id }, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
    data.name = name;
  }
  if (body.leadUserId !== undefined) {
    const leadUserId = body.leadUserId ? String(body.leadUserId) : null;
    if (leadUserId) {
      const lead = await prisma.user.findFirst({ where: { id: leadUserId, deactivatedAt: null }, select: { id: true } });
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 400 });
    }
    data.leadUserId = leadUserId;
  }
  const updated = await prisma.team.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: "team.update",
      targetType: "Team",
      targetId: id,
      beforeJson: { name: team.name, leadUserId: team.leadUserId },
      afterJson: { name: updated.name, leadUserId: updated.leadUserId },
    },
  });
  return NextResponse.json({ team: updated });
}

/** Members move to No team (teamId is set to null by the relation). */
export async function DELETE(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const team = await prisma.team.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.team.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: "team.delete",
      targetType: "Team",
      targetId: id,
      beforeJson: { name: team.name, leadUserId: team.leadUserId, members: team._count.members },
    },
  });
  return NextResponse.json({ ok: true, movedToNoTeam: team._count.members });
}
