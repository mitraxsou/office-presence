import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import { displayName } from "@/lib/display-name";
import { colleaguePresenceWhere, isTestOrDummyAccount } from "@/lib/peers-presence";

/** Shared fields only: In/Out, since when, office name. Never coordinates. */
export async function GET(request: Request) {
  const started = Date.now();
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const me = actor.user;
  if (!me.sharePresenceWithPeers) {
    recordApiActivity({
      userId: me.id,
      deviceTokenId: actor.device?.id,
      method: "GET",
      path: "/api/peers/presence",
      statusCode: 200,
      durationMs: Date.now() - started,
      note: "opted-out",
    });
    return NextResponse.json({ optedIn: false, peers: [] });
  }
  const peers = await prisma.user.findMany({
    where: colleaguePresenceWhere(me),
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
  recordApiActivity({
    userId: me.id,
    deviceTokenId: actor.device?.id,
    method: "GET",
    path: "/api/peers/presence",
    statusCode: 200,
    durationMs: Date.now() - started,
  });

  const visible =
    me.role === "admin" ? peers : peers.filter((p) => !isTestOrDummyAccount(p));

  return NextResponse.json({
    optedIn: true,
    peers: visible.map((p) => ({
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
