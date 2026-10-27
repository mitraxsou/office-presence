import type { DeviceToken, User } from "@prisma/client";
import { prisma } from "./db";
import { getRealSession, getSession, verifyViewAsJwt, type ViewAsMode } from "./auth";
import { authenticateDevice } from "./otp";

export type ViewAsContext = {
  sessionId: string;
  adminId: string;
  mode: ViewAsMode;
};

export type Actor = {
  user: User;
  device: Omit<DeviceToken, "user"> | null;
  viewAs?: ViewAsContext;
};

/** Web session cookie first (honors view-as), then view-as Bearer JWT, then phone device token. */
export async function resolveActor(request: Request): Promise<Actor | null> {
  const session = await getSession();
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user || user.deactivatedAt) return null;
    const viewAs =
      session.adminId && session.viewAsSessionId && session.viewAsMode
        ? { sessionId: session.viewAsSessionId, adminId: session.adminId, mode: session.viewAsMode }
        : undefined;
    return { user, device: null, viewAs };
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const plain = authHeader.slice(7).trim();
    const viewClaims = await verifyViewAsJwt(plain);
    if (viewClaims) {
      const row = await prisma.viewAsSession.findUnique({ where: { id: viewClaims.sessionId } });
      if (
        row &&
        !row.endedAt &&
        row.expiresAt.getTime() > Date.now() &&
        row.adminId === viewClaims.adminId &&
        row.targetUserId === viewClaims.targetId
      ) {
        const user = await prisma.user.findUnique({ where: { id: viewClaims.targetId } });
        if (user && !user.deactivatedAt) {
          return {
            user,
            device: null,
            viewAs: {
              sessionId: viewClaims.sessionId,
              adminId: viewClaims.adminId,
              mode: viewClaims.mode,
            },
          };
        }
      }
      return null;
    }
  }

  const auth = await authenticateDevice(authHeader);
  if (!auth) return null;
  if (auth.user.deactivatedAt) return null;
  return { user: auth.user, device: auth.device };
}

/** Real admin (op_session or device token), never a view-as target. */
export async function resolveRealAdminActor(request: Request): Promise<Actor | null> {
  const session = await getRealSession();
  if (session) {
    if (session.role !== "admin") return null;
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user || user.deactivatedAt || user.role !== "admin") return null;
    return { user, device: null };
  }
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth || auth.user.role !== "admin" || auth.user.deactivatedAt) return null;
  return { user: auth.user, device: auth.device };
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

/** Session cookie or phone Bearer token; must be role admin. Uses effective session (blocks during view-as). */
export async function requireAdminActor(request: Request): Promise<Actor | Response> {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  if (actor.user.role !== "admin") return forbidden();
  return actor;
}

/** Real admin only; for view-as start/end and admin user management while viewing is active. */
export async function requireRealAdminActor(request: Request): Promise<Actor | Response> {
  const actor = await resolveRealAdminActor(request);
  if (!actor) return unauthorized();
  return actor;
}

/** Read-only view-as must not mutate presence, corrections, devices, or sharing. */
export function rejectIfReadonlyViewAs(actor: Actor): Response | null {
  if (actor.viewAs?.mode === "readonly") {
    return Response.json(
      { error: "View-as is read only for this account. End the session to make changes." },
      { status: 403 },
    );
  }
  return null;
}
