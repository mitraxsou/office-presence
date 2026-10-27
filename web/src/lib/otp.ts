import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { ensureUser, isPwcEmail } from "./auth";
import { sendTeamsNotification } from "./notifications";

const OTP_TTL_MS = 10 * 60 * 1000;

function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function requestOtp(emailRaw: string): Promise<{ ok: true; sent: boolean } | { ok: false; error: string; status: number }> {
  const email = emailRaw.trim().toLowerCase();
  if (!isPwcEmail(email)) {
    return { ok: false, error: "Use your PwC email address", status: 400 };
  }
  const code = randomOtp();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.otpCode.create({
    data: {
      email,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  const name = email.split("@")[0];
  const sent = await sendTeamsNotification({
    type: "login_otp",
    email,
    name,
    message: "Your Office Presence sign-in code. It expires in 10 minutes.",
    otp: code,
    otpExpiresMinutes: 10,
  });
  return { ok: true, sent };
}

export async function verifyOtp(emailRaw: string, code: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!isPwcEmail(email) || !/^\d{6}$/.test(code)) {
    return { ok: false as const, error: "Invalid email or code", status: 400 };
  }
  const rows = await prisma.otpCode.findMany({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  let matched = null as (typeof rows)[number] | null;
  for (const row of rows) {
    if (await bcrypt.compare(code, row.codeHash)) {
      matched = row;
      break;
    }
  }
  if (!matched) return { ok: false as const, error: "Invalid or expired code", status: 401 };
  await prisma.otpCode.update({ where: { id: matched.id }, data: { usedAt: new Date() } });
  const user = await ensureUser(email);
  return { ok: true as const, user };
}

export function cleanDeviceLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60);
  return v || null;
}

export async function issueDeviceToken(
  userId: string,
  opts: { installId?: string | null; label?: string | null; platform?: string | null } = {},
) {
  const plain = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const tokenHash = await bcrypt.hash(plain, 10);
  const tokenPrefix = plain.slice(0, 8);
  const installId = opts.installId ?? null;
  if (installId) {
    // Re-login on the same install replaces its old token instead of adding a device.
    await prisma.deviceToken.updateMany({
      where: { userId, installId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const device = await prisma.deviceToken.create({
    data: {
      userId,
      tokenHash,
      tokenPrefix,
      installId,
      label: cleanDeviceLabel(opts.label),
      platform: opts.platform === "ios" ? "ios" : "android",
      lastSeenAt: new Date(),
    },
  });
  return { token: plain, deviceId: device.id };
}

export async function authenticateDevice(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;
  const plain = header.slice(7).trim();
  if (plain.length < 16) return null;
  const prefix = plain.slice(0, 8);
  const candidates = await prisma.deviceToken.findMany({
    where: { tokenPrefix: prefix, revokedAt: null },
    include: { user: true },
    take: 5,
  });
  for (const row of candidates) {
    if (await bcrypt.compare(plain, row.tokenHash)) {
      await prisma.deviceToken.update({
        where: { id: row.id },
        data: { lastSeenAt: new Date() },
      });
      const { user, ...device } = row;
      return { user, device };
    }
  }
  return null;
}

export async function authenticateDeviceToken(header: string | null) {
  return (await authenticateDevice(header))?.user ?? null;
}
