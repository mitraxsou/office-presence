import { prisma } from "./db";
import { getPolicy } from "./policy";

export const RETENTION_BATCH = 5000;
const MAX_BATCHES = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
const VIEW_AS_KEEP_DAYS = 180;

export type RetentionCounts = {
  eventsCleared: number;
  otpCodesDeleted: number;
  throttlesDeleted: number;
  viewAsSessionsDeleted: number;
  batches: number;
  done: boolean;
};

/**
 * Daily privacy clean-up. Clears coordinates and Wi-Fi on old presence events (office and
 * points stay, so totals do not change) and deletes short-lived auth rows. Safe to rerun.
 */
export async function runRetention(opts: { now?: Date; batchSize?: number } = {}): Promise<RetentionCounts> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? RETENTION_BATCH;
  const rules = await getPolicy();
  const days = rules.rawLocationRetentionDays ?? 90;
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  let eventsCleared = 0;
  let batches = 0;
  let done = false;
  while (batches < MAX_BATCHES) {
    const rows = await prisma.presenceEvent.findMany({
      where: {
        recordedAt: { lt: cutoff },
        OR: [
          { latitude: { not: null } },
          { longitude: { not: null } },
          { wifiSsid: { not: null } },
          { wifiBssid: { not: null } },
        ],
      },
      select: { id: true },
      take: batchSize,
    });
    batches += 1;
    if (rows.length > 0) {
      const res = await prisma.presenceEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { latitude: null, longitude: null, wifiSsid: null, wifiBssid: null },
      });
      eventsCleared += res.count;
    }
    if (rows.length < batchSize) {
      done = true;
      break;
    }
  }

  const dayAgo = new Date(now.getTime() - DAY_MS);
  const viewAsCutoff = new Date(now.getTime() - VIEW_AS_KEEP_DAYS * DAY_MS);
  const [otp, throttle, viewAs] = await Promise.all([
    prisma.otpCode.deleteMany({ where: { createdAt: { lt: dayAgo } } }),
    prisma.authThrottle.deleteMany({
      where: { updatedAt: { lt: dayAgo }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    }),
    prisma.viewAsSession.deleteMany({
      where: { OR: [{ endedAt: { lt: viewAsCutoff } }, { endedAt: null, expiresAt: { lt: viewAsCutoff } }] },
    }),
  ]);

  const counts: RetentionCounts = {
    eventsCleared,
    otpCodesDeleted: otp.count,
    throttlesDeleted: throttle.count,
    viewAsSessionsDeleted: viewAs.count,
    batches,
    done,
  };
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "privacy.retention",
      targetType: "PresenceEvent",
      afterJson: { ...counts, retentionDays: days, cutoff: cutoff.toISOString() },
    },
  });
  return counts;
}
