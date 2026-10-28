import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/db";

function adminApp(): App | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    if (getApps().length > 0) return getApps()[0]!;
    return initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
      }),
    });
  } catch (e) {
    console.warn("[firebase-admin] init failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * High-priority data message so a backgrounded/killed app can force sign-out.
 * No-ops (with log) when FIREBASE_SERVICE_ACCOUNT_JSON is missing.
 */
export async function sendForceSignOutToUser(
  userId: string,
  opts: { reason?: string; message?: string } = {},
): Promise<{ sent: number; skipped: boolean }> {
  const app = adminApp();
  if (!app) {
    console.warn("[firebase-admin] force_sign_out skipped: no FIREBASE_SERVICE_ACCOUNT_JSON");
    return { sent: 0, skipped: true };
  }
  const devices = await prisma.deviceToken.findMany({
    where: { userId, revokedAt: null, fcmToken: { not: null } },
    select: { id: true, fcmToken: true },
  });
  const tokens = devices.map((d) => d.fcmToken!).filter((t) => t.length > 20);
  if (tokens.length === 0) return { sent: 0, skipped: false };

  const reason = opts.reason ?? "account_unavailable";
  const message =
    opts.message ??
    (reason === "deactivated"
      ? "This account is deactivated. Contact your admin to reactivate it."
      : "This account is no longer available. Sign in again.");

  const messaging = getMessaging(app);
  const res = await messaging.sendEachForMulticast({
    tokens,
    data: {
      type: "force_sign_out",
      reason,
      message,
    },
    android: {
      priority: "high",
    },
  });
  // Drop invalid tokens so we do not keep failing forever.
  const stale: string[] = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code ?? "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("invalid-argument")
      ) {
        stale.push(tokens[i]!);
      }
    }
  });
  if (stale.length > 0) {
    await prisma.deviceToken.updateMany({
      where: { userId, fcmToken: { in: stale } },
      data: { fcmToken: null },
    });
  }
  return { sent: res.successCount, skipped: false };
}

const FRESH_MS = 20 * 60_000;

/**
 * Work-hours safety net: wake phones for one location check after OEM kill.
 * Skips devices seen in the last 20 minutes. No-ops without Admin SDK env.
 */
export async function sendPresenceCheckToActiveDevices(): Promise<{
  sent: number;
  skipped: boolean;
  considered: number;
}> {
  const app = adminApp();
  if (!app) {
    console.warn("[firebase-admin] presence_check skipped: no FIREBASE_SERVICE_ACCOUNT_JSON");
    return { sent: 0, skipped: true, considered: 0 };
  }
  const freshBefore = new Date(Date.now() - FRESH_MS);
  const devices = await prisma.deviceToken.findMany({
    where: {
      revokedAt: null,
      fcmToken: { not: null },
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: freshBefore } }],
    },
    select: { id: true, fcmToken: true },
  });
  const tokens = [...new Set(devices.map((d) => d.fcmToken!).filter((t) => t.length > 20))];
  if (tokens.length === 0) return { sent: 0, skipped: false, considered: devices.length };

  const messaging = getMessaging(app);
  // Multicast max 500 tokens per call.
  let success = 0;
  const stale: string[] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      data: { type: "presence_check" },
      android: { priority: "high" },
    });
    success += res.successCount;
    res.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code ?? "";
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token") ||
          code.includes("invalid-argument")
        ) {
          stale.push(batch[idx]!);
        }
      }
    });
  }
  if (stale.length > 0) {
    await prisma.deviceToken.updateMany({
      where: { fcmToken: { in: stale } },
      data: { fcmToken: null },
    });
  }
  return { sent: success, skipped: false, considered: tokens.length };
}
