import { prisma } from "./db";

/**
 * Postgres-backed throttle (AuthThrottle). In-memory counters do not work on Vercel
 * because every request may land on a different instance.
 */
export type ThrottleSqlRunner = <T = Record<string, unknown>>(sql: string, params: unknown[]) => Promise<T[]>;

const prismaRunner: ThrottleSqlRunner = async <T,>(sql: string, params: unknown[]) =>
  (await prisma.$queryRawUnsafe(sql, ...params)) as T[];

let runSql: ThrottleSqlRunner = prismaRunner;

/** Tests swap in a PGlite runner. */
export function setThrottleSqlRunner(runner: ThrottleSqlRunner | null) {
  runSql = runner ?? prismaRunner;
}

export const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Wait 15 minutes, then try again.";

export const LIMITS = {
  otpRequestEmail: { limit: 5, windowMs: 60 * 60_000, lockMs: 60 * 60_000 },
  otpRequestIp: { limit: 30, windowMs: 60 * 60_000, lockMs: 60 * 60_000 },
  otpVerifyEmail: { limit: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  otpVerifyIp: { limit: 50, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  passwordEmail: { limit: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  passwordIp: { limit: 50, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
} as const;

export const throttleKeys = {
  otpRequestEmail: (email: string) => `otp_req:${email}`,
  otpRequestIp: (ip: string) => `otp_req_ip:${ip}`,
  otpVerifyEmail: (email: string) => `otp_fail:${email}`,
  otpVerifyIp: (ip: string) => `otp_fail_ip:${ip}`,
  passwordEmail: (email: string) => `pw_fail:${email}`,
  passwordIp: (ip: string) => `pw_fail_ip:${ip}`,
};

export type HitResult = {
  /** This attempt fits inside the limit. */
  allowed: boolean;
  /** The key is locked after this attempt (the limit was reached). */
  locked: boolean;
  count: number;
  retryAfterSeconds: number;
};

const TS = (n: number) => `(to_timestamp($${n}::float8 / 1000.0) AT TIME ZONE 'UTC')`;

function secondsUntil(ms: number | null | undefined, nowMs: number): number {
  if (ms == null || !Number.isFinite(ms) || ms <= nowMs) return 0;
  return Math.ceil((ms - nowMs) / 1000);
}

/**
 * Count one attempt for [key] in a single atomic upsert. Resets the window when it expired and
 * sets lockedUntil once the count reaches [limit].
 */
export async function hit(
  key: string,
  limit: number,
  windowMs: number,
  lockMs: number,
  nowMs: number = Date.now(),
): Promise<HitResult> {
  const expired = `"AuthThrottle"."windowStart" <= ${TS(4)}`;
  const nextCount = `(CASE WHEN ${expired} THEN 1 ELSE "AuthThrottle"."count" + 1 END)`;
  const sql = `
    INSERT INTO "AuthThrottle" ("key", "count", "windowStart", "lockedUntil", "updatedAt")
    VALUES ($1, 1, ${TS(2)}, CASE WHEN 1 >= $3::int THEN ${TS(5)} ELSE NULL END, ${TS(2)})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = ${nextCount},
      "windowStart" = CASE WHEN ${expired} THEN ${TS(2)} ELSE "AuthThrottle"."windowStart" END,
      "lockedUntil" = CASE
        WHEN ${nextCount} >= $3::int THEN GREATEST(COALESCE("AuthThrottle"."lockedUntil", ${TS(5)}), ${TS(5)})
        WHEN "AuthThrottle"."lockedUntil" > ${TS(2)} THEN "AuthThrottle"."lockedUntil"
        ELSE NULL
      END,
      "updatedAt" = ${TS(2)}
    RETURNING "count", (EXTRACT(EPOCH FROM "lockedUntil") * 1000)::float8 AS "lockedMs"`;
  const rows = await runSql<{ count: number; lockedMs: number | null }>(sql, [
    key,
    nowMs,
    limit,
    nowMs - windowMs,
    nowMs + lockMs,
  ]);
  const row = rows[0];
  const count = Number(row?.count ?? 1);
  const lockedMs = row?.lockedMs == null ? null : Number(row.lockedMs);
  const retryAfterSeconds = secondsUntil(lockedMs, nowMs);
  return { allowed: count <= limit, locked: retryAfterSeconds > 0, count, retryAfterSeconds };
}

/** Seconds left on the lock for [key], or 0 when it is not locked. */
export async function isLocked(key: string, nowMs: number = Date.now()): Promise<number> {
  const rows = await runSql<{ lockedMs: number | null }>(
    `SELECT (EXTRACT(EPOCH FROM "lockedUntil") * 1000)::float8 AS "lockedMs" FROM "AuthThrottle" WHERE "key" = $1`,
    [key],
  );
  const v = rows[0]?.lockedMs;
  return secondsUntil(v == null ? null : Number(v), nowMs);
}

/** Longest lock among [keys], or 0. */
export async function lockedFor(keys: string[], nowMs: number = Date.now()): Promise<number> {
  let worst = 0;
  for (const k of keys) worst = Math.max(worst, await isLocked(k, nowMs));
  return worst;
}

export async function clear(key: string): Promise<void> {
  await runSql(`DELETE FROM "AuthThrottle" WHERE "key" = $1 RETURNING "key"`, [key]);
}

/** Delete counters idle for longer than [idleMs] (retention job). */
export async function pruneIdle(idleMs: number, nowMs: number = Date.now()): Promise<number> {
  const rows = await runSql<{ key: string }>(
    `DELETE FROM "AuthThrottle" WHERE "updatedAt" < ${TS(1)}
       AND ("lockedUntil" IS NULL OR "lockedUntil" < ${TS(2)}) RETURNING "key"`,
    [nowMs - idleMs, nowMs],
  );
  return rows.length;
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first;
  const real = request.headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

export type ThrottledFailure = {
  ok: false;
  error: string;
  status: 429;
  retryAfterSeconds: number;
};

export function throttled(retryAfterSeconds: number): ThrottledFailure {
  return {
    ok: false,
    error: TOO_MANY_ATTEMPTS_MESSAGE,
    status: 429,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
  };
}

/** Standard 429 JSON body and headers. */
export function tooManyResponseInit(retryAfterSeconds: number, extra: Record<string, string> = {}) {
  const s = Math.max(1, Math.ceil(retryAfterSeconds));
  return {
    body: { error: TOO_MANY_ATTEMPTS_MESSAGE, retryAfterSeconds: s },
    init: { status: 429, headers: { ...extra, "Retry-After": String(s) } },
  };
}
