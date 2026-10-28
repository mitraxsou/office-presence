import { prisma } from "./db";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const THROTTLE_MS = 15 * 60 * 1000;

const THROTTLED_PATHS = new Set([
  "/api/me/sync",
  "/api/me/reports",
  "/api/me/year",
  "/api/peers/presence",
]);

export type LogApiActivityInput = {
  userId: string;
  deviceTokenId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs?: number | null;
  note?: string | null;
  /** When true, skip if same device+path logged within 15 minutes. */
  throttle?: boolean;
};

/** Normalize path: strip query string, collapse dynamic segments lightly. */
export function normalizeApiPath(raw: string): string {
  const noQuery = raw.split("?")[0] || "/";
  return noQuery.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/**
 * Record a significant API call. Fire-and-forget safe: never throws to callers.
 * Prunes rows older than 14 days on each write.
 */
export async function logDeviceApiActivity(input: LogApiActivityInput): Promise<void> {
  try {
    const path = normalizeApiPath(input.path);
    const method = input.method.toUpperCase();
    const deviceTokenId = input.deviceTokenId || null;
    const throttle = input.throttle ?? THROTTLED_PATHS.has(path);

    if (throttle && deviceTokenId) {
      const since = new Date(Date.now() - THROTTLE_MS);
      const recent = await prisma.deviceApiActivity.findFirst({
        where: { deviceTokenId, path, at: { gte: since } },
        select: { id: true },
      });
      if (recent) return;
    }

    const cutoff = new Date(Date.now() - RETENTION_MS);
    await prisma.$transaction([
      prisma.deviceApiActivity.create({
        data: {
          userId: input.userId,
          deviceTokenId,
          method,
          path,
          statusCode: input.statusCode,
          durationMs: input.durationMs ?? null,
          note: input.note ?? null,
        },
      }),
      prisma.deviceApiActivity.deleteMany({ where: { at: { lt: cutoff } } }),
    ]);
  } catch {
    // Diagnostics must never break the request.
  }
}

/** Non-blocking wrapper for route handlers. */
export function recordApiActivity(input: LogApiActivityInput): void {
  void logDeviceApiActivity(input);
}
