import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import {
  setViewAsCookie,
  signViewAsToken,
  VIEW_AS_TTL_MS,
  type ViewAsMode,
} from "@/lib/auth";
import { displayName } from "@/lib/display-name";

export async function POST(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? body.user_id ?? "").trim();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.deactivatedAt) {
    return NextResponse.json({ error: "Cannot view as a deactivated user" }, { status: 400 });
  }
  if (target.role === "admin") {
    return NextResponse.json({ error: "Cannot view as another admin" }, { status: 400 });
  }
  if (target.id === actor.user.id) {
    return NextResponse.json({ error: "Cannot view as yourself" }, { status: 400 });
  }

  const mode: ViewAsMode = target.isTestAccount || target.isDummy ? "full" : "readonly";
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + VIEW_AS_TTL_MS);

  // End any open sessions for this admin first.
  await prisma.viewAsSession.updateMany({
    where: { adminId: actor.user.id, endedAt: null },
    data: { endedAt: startedAt },
  });

  const session = await prisma.viewAsSession.create({
    data: {
      adminId: actor.user.id,
      targetUserId: target.id,
      mode,
      startedAt,
      expiresAt,
    },
  });

  const targetPayload = {
    id: target.id,
    email: target.email,
    role: target.role,
    name: displayName(target),
  };

  const viewAsToken = await signViewAsToken({
    sessionId: session.id,
    adminId: actor.user.id,
    target: {
      id: target.id,
      email: target.email,
      role: target.role,
      name: targetPayload.name,
    },
    mode,
    expiresAt,
  });

  // Web: httpOnly cookie. Phone: return token for Authorization header.
  const isPhone = !!request.headers.get("authorization")?.startsWith("Bearer ");
  if (!isPhone) {
    await setViewAsCookie(viewAsToken, expiresAt);
  }

  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: "view_as.start",
      targetType: "User",
      targetId: target.id,
      afterJson: { sessionId: session.id, mode },
    },
  });

  recordApiActivity({
    userId: actor.user.id,
    deviceTokenId: actor.device?.id,
    method: "POST",
    path: "/api/admin/view-as",
    statusCode: 200,
    note: "start",
    throttle: false,
  });

  return NextResponse.json({
    session: {
      id: session.id,
      adminId: session.adminId,
      targetUserId: session.targetUserId,
      mode: session.mode,
      startedAt: session.startedAt.toISOString(),
      endedAt: null,
      expiresAt: session.expiresAt.toISOString(),
    },
    mode,
    expiresAt: expiresAt.toISOString(),
    viewAsToken: isPhone ? viewAsToken : undefined,
    cookie: isPhone ? undefined : "view_as_session",
    target: {
      id: target.id,
      name: targetPayload.name,
      email: target.email,
      isTestAccount: target.isTestAccount || target.isDummy,
    },
  });
}
