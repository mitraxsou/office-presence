import type { DeviceToken, User } from "@prisma/client";
import { prisma } from "./db";
import { getSession } from "./auth";
import { authenticateDevice } from "./otp";

export type Actor = { user: User; device: Omit<DeviceToken, "user"> | null };

/** Web session cookie first, then phone Bearer device token. */
export async function resolveActor(request: Request): Promise<Actor | null> {
  const session = await getSession();
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    return user ? { user, device: null } : null;
  }
  const auth = await authenticateDevice(request.headers.get("authorization"));
  return auth ? { user: auth.user, device: auth.device } : null;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

/** Session cookie or phone Bearer token; must be role admin. */
export async function requireAdminActor(request: Request): Promise<Actor | Response> {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  if (actor.user.role !== "admin") return forbidden();
  return actor;
}
