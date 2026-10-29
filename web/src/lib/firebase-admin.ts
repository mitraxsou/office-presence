import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/db";
import { downloadPageUrl, shouldNotifyAppUpdate } from "@/lib/app-update";

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

function isStaleToken(code: string): boolean {
  return (
    code.includes("registration-token-not-registered") ||
    code.includes("invalid-registration-token") ||
    code.includes("invalid-argument")
  );
}

async function sendData(
  tokens: string[],
  data: Record<string, string>,
): Promise<{ sent: number; stale: string[]; ok: string[] }> {
  const app = adminApp();
  if (!app || tokens.length === 0) return { sent: 0, stale: [], ok: [] };
  const messaging = getMessaging(app);
  let sent = 0;
  const stale: string[] = [];
  const ok: string[] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      data,
      android: { priority: "high" },
    });
    sent += res.successCount;
    res.responses.forEach((r, idx) => {
      const token = batch[idx]!;
      if (r.success) ok.push(token);
      else if (isStaleToken(r.error?.code ?? "")) stale.push(token);
    });
  }
  return { sent, stale, ok };
}

async function clearStale(tokens: string[], userId?: string) {
  if (tokens.length === 0) return;
  await prisma.deviceToken.updateMany({
    where: { fcmToken: { in: tokens }, ...(userId ? { userId } : {}) },
    data: { fcmToken: null },
  });
}

/**
 * High-priority data message so a backgrounded app can force sign-out.
 * No-ops when FIREBASE_SERVICE_ACCOUNT_JSON is missing.
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
    select: { fcmToken: true },
  });
  const tokens = devices.map((d) => d.fcmToken!).filter((t) => t.length > 20);
  if (tokens.length === 0) return { sent: 0, skipped: false };

  const reason = opts.reason ?? "account_unavailable";
  const message =
    opts.message ??
    (reason === "deactivated"
      ? "This account is deactivated. Contact your admin to reactivate it."
      : "This account is no longer available. Sign in again.");

  const res = await sendData(tokens, { type: "force_sign_out", reason, message });
  await clearStale(res.stale, userId);
  return { sent: res.sent, skipped: false };
}

const FRESH_MS = 20 * 60_000;

/**
 * Work-hours safety net: wake phones for one location check after an OEM kill.
 * Skips devices seen in the last 20 minutes.
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
    select: { fcmToken: true },
  });
  const tokens = [...new Set(devices.map((d) => d.fcmToken!).filter((t) => t.length > 20))];
  if (tokens.length === 0) return { sent: 0, skipped: false, considered: devices.length };
  const res = await sendData(tokens, { type: "presence_check" });
  await clearStale(res.stale);
  return { sent: res.sent, skipped: false, considered: tokens.length };
}

/** Ask every registered phone to sync policy. Data only, no banner. */
export async function sendRulesChangedToDevices(): Promise<{ sent: number; skipped: boolean }> {
  const app = adminApp();
  if (!app) {
    console.warn("[firebase-admin] rules_changed skipped: no FIREBASE_SERVICE_ACCOUNT_JSON");
    return { sent: 0, skipped: true };
  }
  const devices = await prisma.deviceToken.findMany({
    where: { revokedAt: null, fcmToken: { not: null } },
    select: { fcmToken: true },
  });
  const tokens = [...new Set(devices.map((d) => d.fcmToken!).filter((t) => t.length > 20))];
  if (tokens.length === 0) return { sent: 0, skipped: false };
  const res = await sendData(tokens, { type: "rules_changed" });
  await clearStale(res.stale);
  return { sent: res.sent, skipped: false };
}

export async function notifyOutdatedDevices(publishedVersionCode: number): Promise<{ sent: number }> {
  if (publishedVersionCode <= 0) return { sent: 0 };
  const app = adminApp();
  if (!app) return { sent: 0 };
  const devices = await prisma.deviceToken.findMany({
    where: {
      revokedAt: null,
      fcmToken: { not: null },
      appVersionCode: { lt: publishedVersionCode },
      OR: [
        { updateNotifiedVersionCode: null },
        { updateNotifiedVersionCode: { lt: publishedVersionCode } },
      ],
    },
    select: { id: true, fcmToken: true, appVersionCode: true, updateNotifiedVersionCode: true },
  });
  const due = devices.filter((d) =>
    shouldNotifyAppUpdate(d.appVersionCode, publishedVersionCode, d.updateNotifiedVersionCode),
  );
  if (due.length === 0) return { sent: 0 };
  const url = downloadPageUrl();
  const versionName = (
    await prisma.policy.findUnique({ where: { id: 1 }, select: { appVersionName: true } })
  )?.appVersionName ?? "";
  const byToken = new Map(due.map((d) => [d.fcmToken!, d.id]));
  const tokens = [...byToken.keys()];
  const res = await sendData(tokens, {
    type: "app_update",
    url,
    versionCode: String(publishedVersionCode),
    versionName,
  });
  await clearStale(res.stale);
  const notifiedIds = res.ok.map((t) => byToken.get(t)!).filter(Boolean);
  if (notifiedIds.length > 0) {
    await prisma.deviceToken.updateMany({
      where: { id: { in: notifiedIds } },
      data: { updateNotifiedVersionCode: publishedVersionCode },
    });
  }
  return { sent: res.sent };
}

export async function maybeNotifyDeviceUpdate(deviceId: string): Promise<void> {
  const policy = await prisma.policy.findUnique({ where: { id: 1 } });
  const published = policy?.appVersionCode ?? 0;
  const device = await prisma.deviceToken.findUnique({ where: { id: deviceId } });
  if (!device?.fcmToken || device.revokedAt) return;
  if (!shouldNotifyAppUpdate(device.appVersionCode, published, device.updateNotifiedVersionCode)) return;
  if (!adminApp()) return;
  const res = await sendData([device.fcmToken], {
    type: "app_update",
    url: downloadPageUrl(),
    versionCode: String(published),
    versionName: policy?.appVersionName ?? "",
  });
  await clearStale(res.stale);
  if (res.ok.includes(device.fcmToken)) {
    await prisma.deviceToken.update({
      where: { id: device.id },
      data: { updateNotifiedVersionCode: published },
    });
  }
}

/** Push helpers that must not fail the caller. */
export async function pushForceSignOut(userId: string, reason: string): Promise<void> {
  try {
    await sendForceSignOutToUser(userId, { reason });
  } catch (e) {
    console.warn("[firebase-admin] force_sign_out failed", e instanceof Error ? e.message : e);
  }
}

export async function pushRulesChanged(): Promise<void> {
  try {
    await sendRulesChangedToDevices();
  } catch (e) {
    console.warn("[firebase-admin] rules_changed failed", e instanceof Error ? e.message : e);
  }
}

export async function pushOutdatedAppUpdates(publishedVersionCode: number): Promise<void> {
  try {
    await notifyOutdatedDevices(publishedVersionCode);
  } catch (e) {
    console.warn("[firebase-admin] app_update failed", e instanceof Error ? e.message : e);
  }
}
