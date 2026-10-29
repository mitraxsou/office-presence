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

const QUIET_DAY_MODES = ["all", "weekdays", "custom"] as const;
export type QuietHoursDays = (typeof QUIET_DAY_MODES)[number];

/** all, weekdays, or custom. undefined means the field was omitted or invalid. */
export function parseQuietHoursDays(raw: unknown): QuietHoursDays | undefined {
  if (raw === undefined) return undefined;
  const s = String(raw).trim();
  return (QUIET_DAY_MODES as readonly string[]).includes(s) ? (s as QuietHoursDays) : undefined;
}

/** Comma-separated weekday numbers, Monday = 1 through Sunday = 7. At least one day. */
export function parseQuietCustomDays(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) return undefined;
  return [...new Set(nums)].sort((a, b) => a - b).join(",");
}

export function clampName(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().slice(0, max);
  return s || null;
}
