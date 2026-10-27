import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  return NextResponse.json({
    sharePresenceWithPeers: actor.user.sharePresenceWithPeers,
    sharePresenceConsentAt: actor.user.sharePresenceConsentAt,
  });
}

export async function PATCH(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const share = body.sharePresenceWithPeers === true;
  if (share && body.consent !== true) {
    return NextResponse.json({ error: "Explicit consent required" }, { status: 400 });
  }
  const before = actor.user;
  const user = await prisma.user.update({
    where: { id: before.id },
    data: {
      sharePresenceWithPeers: share,
      sharePresenceConsentAt: share ? new Date() : null,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: before.id,
      action: share ? "privacy.share_on" : "privacy.share_off",
      targetType: "User",
      targetId: before.id,
      beforeJson: { sharePresenceWithPeers: before.sharePresenceWithPeers },
      afterJson: { sharePresenceWithPeers: user.sharePresenceWithPeers, via: actor.device ? "phone" : "web" },
    },
  });
  return NextResponse.json({
    sharePresenceWithPeers: user.sharePresenceWithPeers,
    sharePresenceConsentAt: user.sharePresenceConsentAt,
  });
}
