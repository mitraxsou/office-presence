import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";

/** Shared fields only: In/Out, since when, office name. Never coordinates. */
export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const me = actor.user;
  if (!me.sharePresenceWithPeers) {
    return NextResponse.json({ optedIn: false, peers: [] });
  }
  const peers = await prisma.user.findMany({
    where: { sharePresenceWithPeers: true, id: { not: me.id } },
    select: {
      id: true,
      name: true,
      email: true,
      status: { select: { inOffice: true, sinceAt: true, officeLocationId: true, office: { select: { name: true } } } },
    },
    orderBy: { email: "asc" },
  });
  return NextResponse.json({
    optedIn: true,
    peers: peers.map((p) => ({
      id: p.id,
      name: p.name ?? p.email.split("@")[0],
      email: p.email,
      inOffice: p.status?.inOffice ?? false,
      sinceAt: p.status?.inOffice ? p.status?.sinceAt?.toISOString() ?? null : null,
      officeName: p.status?.inOffice ? p.status?.office?.name ?? null : null,
    })),
  });
}
