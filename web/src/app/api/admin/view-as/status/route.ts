import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";
import { clearViewAsCookie, getSession } from "@/lib/auth";
import { displayName } from "@/lib/display-name";

export async function GET(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;

  const now = new Date();
  const open = await prisma.viewAsSession.findFirst({
    where: {
      adminId: actor.user.id,
      endedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { startedAt: "desc" },
    include: {
      target: {
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          colleagueDisplayMode: true,
          isTestAccount: true,
          isDummy: true,
        },
      },
    },
  });

  if (!open) {
    // Expire stale open rows and clear cookie if present.
    await prisma.viewAsSession.updateMany({
      where: { adminId: actor.user.id, endedAt: null, expiresAt: { lte: now } },
      data: { endedAt: now },
    });
    const effective = await getSession();
    if (effective?.adminId) await clearViewAsCookie();
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({
    session: {
      id: open.id,
      adminId: open.adminId,
      targetUserId: open.targetUserId,
      mode: open.mode,
      startedAt: open.startedAt.toISOString(),
      endedAt: null,
      expiresAt: open.expiresAt.toISOString(),
      target: {
        id: open.target.id,
        name: displayName(open.target),
        email: open.target.email,
        isTestAccount: open.target.isTestAccount || open.target.isDummy,
      },
    },
  });
}
