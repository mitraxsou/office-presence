import type { Role } from "@prisma/client";
import { isPwcEmail } from "./email";

/** Admin cannot change their own role, or deactivate / delete themselves. */
export function isSelfGuardBlocked(actorId: string, targetId: string): boolean {
  return actorId === targetId;
}

/**
 * True when the change would leave zero active admins.
 * otherActiveAdminCount = active admins excluding the target.
 */
export function wouldRemoveLastAdmin(opts: {
  targetRole: Role;
  nextRole?: Role;
  deactivating?: boolean;
  deleting?: boolean;
  otherActiveAdminCount: number;
}): boolean {
  if (opts.targetRole !== "admin") return false;
  const demoting = opts.nextRole != null && opts.nextRole !== "admin";
  const removing = opts.deactivating === true || opts.deleting === true || demoting;
  if (!removing) return false;
  return opts.otherActiveAdminCount < 1;
}

export function isTestUserEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith("@example.pwc.local") || e.startsWith("dummy.");
}

export function validatePwcUserEmail(emailRaw: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Valid email required" };
  }
  if (!isPwcEmail(email)) {
    return { ok: false, error: "Email must end with @pwc.com" };
  }
  return { ok: true, email };
}

/** Real users need @pwc.com. Test accounts may also use @example.pwc.local. */
export function validateAdminUserEmail(
  emailRaw: string,
  opts?: { allowTestDomain?: boolean },
): { ok: true; email: string } | { ok: false; error: string } {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Valid email required" };
  }
  if (isPwcEmail(email)) return { ok: true, email };
  if (opts?.allowTestDomain && isTestUserEmail(email)) return { ok: true, email };
  return { ok: false, error: "Email must end with @pwc.com" };
}

const QUIET_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseQuietHours(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (!QUIET_RE.test(s)) return undefined;
  return s;
}

export function clampName(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().slice(0, max);
  return s || null;
}
