import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";
import { displayName } from "@/lib/display-name";

const personSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  colleagueDisplayMode: true,
} as const;

export async function GET(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const [teams, noTeam] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        lead: { select: personSelect },
        members: {
          where: { deactivatedAt: null },
          orderBy: { email: "asc" },
          select: { ...personSelect, manager: { select: personSelect } },
        },
      },
    }),
    prisma.user.count({ where: { deactivatedAt: null, teamId: null, isTestAccount: false, isDummy: false } }),
  ]);
  return NextResponse.json({
    noTeamCount: noTeam,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt.toISOString(),
      lead: t.lead ? { id: t.lead.id, email: t.lead.email, name: displayName(t.lead) } : null,
      members: t.members.map((m) => ({
        id: m.id,
        email: m.email,
        name: displayName(m),
        managerName: m.manager ? displayName(m.manager) : null,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  const leadUserId = body.leadUserId ? String(body.leadUserId) : null;
  if (leadUserId) {
    const lead = await prisma.user.findFirst({ where: { id: leadUserId, deactivatedAt: null }, select: { id: true } });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 400 });
  }
  const clash = await prisma.team.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (clash) return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
  const team = await prisma.team.create({ data: { name, leadUserId } });
  await prisma.auditLog.create({
    data: { actorId: actor.user.id, action: "team.create", targetType: "Team", targetId: team.id, afterJson: { name, leadUserId } },
  });
  return NextResponse.json({ team }, { status: 201 });
}
