import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";
import { displayName } from "@/lib/display-name";

/** Shared fields only: In/Out, since when, office name. Never coordinates. */
export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const me = actor.user;
  if (!me.sharePresenceWithPeers) {
    return NextResponse.json({ optedIn: false, peers: [] });
  }
  const peers = await prisma.user.findMany({
    where: {
      sharePresenceWithPeers: true,
      id: { not: me.id },
      deactivatedAt: null,
    },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      colleagueDisplayMode: true,
      email: true,
      isDummy: true,
      isTestAccount: true,
      status: { select: { inOffice: true, sinceAt: true, officeLocationId: true, office: { select: { name: true } } } },
    },
    orderBy: [{ isDummy: "desc" }, { email: "asc" }],
  });
  return NextResponse.json({
    optedIn: true,
    peers: peers.map((p) => ({
      id: p.id,
      name: displayName(p),
      email: p.email,
      isDummy: p.isDummy,
      isTestAccount: p.isTestAccount || p.isDummy,
      inOffice: p.status?.inOffice ?? false,
      sinceAt: p.status?.inOffice ? p.status?.sinceAt?.toISOString() ?? null : null,
      officeName: p.status?.inOffice ? p.status?.office?.name ?? null : null,
    })),
  });
}
