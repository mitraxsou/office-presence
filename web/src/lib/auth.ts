import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import type { Role } from "@prisma/client";

export { isPwcEmail } from "./email";

const COOKIE = "op_session";
export const VIEW_AS_COOKIE = "view_as_session";
export const VIEW_AS_TTL_MS = 30 * 60 * 1000;

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET missing or too short");
  return new TextEncoder().encode(s);
}

export type ViewAsMode = "readonly" | "full";

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  /** Real admin id when this session is viewing as another user. */
  adminId?: string;
  viewAsSessionId?: string;
  viewAsMode?: ViewAsMode;
};

type JwtClaims = {
  sub?: string;
  email?: string;
  role?: Role;
  name?: string | null;
  adminId?: string;
  sessionId?: string;
  mode?: string;
  typ?: string;
};

function sessionFromPayload(payload: JwtClaims): SessionUser | null {
  if (!payload.sub || typeof payload.email !== "string") return null;
  return {
    id: payload.sub,
    email: payload.email,
    role: (payload.role as Role) ?? "user",
    name: (payload.name as string) ?? null,
  };
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(VIEW_AS_COOKIE);
}

/** Real signed-in user from op_session only (ignores view-as). */
export async function getRealSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return sessionFromPayload(payload as JwtClaims);
  } catch {
    return null;
  }
}

export async function signViewAsToken(opts: {
  sessionId: string;
  adminId: string;
  target: { id: string; email: string; role: Role; name: string | null };
  mode: ViewAsMode;
  expiresAt: Date;
}): Promise<string> {
  return new SignJWT({
    sub: opts.target.id,
    email: opts.target.email,
    role: opts.target.role,
    name: opts.target.name,
    adminId: opts.adminId,
    sessionId: opts.sessionId,
    mode: opts.mode,
    typ: "view_as",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts.expiresAt)
    .sign(secretKey());
}

export async function setViewAsCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  jar.set(VIEW_AS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function clearViewAsCookie() {
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
}

export async function verifyViewAsJwt(token: string): Promise<{
  targetId: string;
  adminId: string;
  sessionId: string;
  mode: ViewAsMode;
  email: string;
  role: Role;
  name: string | null;
} | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const p = payload as JwtClaims;
    if (p.typ !== "view_as" || !p.sub || typeof p.email !== "string" || !p.adminId || !p.sessionId) {
      return null;
    }
    const mode: ViewAsMode = p.mode === "full" ? "full" : "readonly";
    return {
      targetId: p.sub,
      adminId: p.adminId,
      sessionId: p.sessionId,
      mode,
      email: p.email,
      role: (p.role as Role) ?? "user",
      name: (p.name as string) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Effective session: when a valid view-as cookie is present, returns the
 * viewed user with adminId / viewAsSessionId / viewAsMode set.
 */
export async function getSession(): Promise<SessionUser | null> {
  const real = await getRealSession();
  if (!real) return null;

  const jar = await cookies();
  const viewToken = jar.get(VIEW_AS_COOKIE)?.value;
  if (!viewToken) return real;

  const claims = await verifyViewAsJwt(viewToken);
  if (!claims || claims.adminId !== real.id) {
    await clearViewAsCookie();
    return real;
  }

  const row = await prisma.viewAsSession.findUnique({ where: { id: claims.sessionId } });
  if (!row || row.endedAt || row.expiresAt.getTime() <= Date.now() || row.adminId !== real.id) {
    await clearViewAsCookie();
    return real;
  }

  return {
    id: claims.targetId,
    email: claims.email,
    role: claims.role,
    name: claims.name,
    adminId: real.id,
    viewAsSessionId: claims.sessionId,
    viewAsMode: claims.mode,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  return s;
}

export async function requireAdmin(): Promise<SessionUser> {
  const s = await requireUser();
  if (s.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  return s;
}

/** Admin check against the real signed-in user (not the viewed user). */
export async function requireRealAdmin(): Promise<SessionUser> {
  const s = await getRealSession();
  if (!s) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  if (s.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  return s;
}

export async function ensureUser(email: string) {
  const normalized = email.trim().toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const role: Role = normalized === adminEmail ? "admin" : "user";
  return prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized, role, name: normalized.split("@")[0] },
    update: role === "admin" ? { role: "admin" } : {},
  });
}
