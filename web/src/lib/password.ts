import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { createSession } from "./auth";
import { issueDeviceToken } from "./otp";
import { isPwcEmail } from "./email";
import { isTestUserEmail } from "./users-admin";

const BCRYPT_ROUNDS = 10;
const MIN_LEN = 8;
const MAX_LEN = 128;

/** Login emails: @pwc.com, or test accounts @example.pwc.local / dummy.*. */
export function isLoginEmail(emailRaw: string): boolean {
  const email = emailRaw.trim().toLowerCase();
  return isPwcEmail(email) || isTestUserEmail(email);
}

export function validatePasswordPlain(password: unknown): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof password !== "string") {
    return { ok: false, error: "Password is required" };
  }
  if (password.length < MIN_LEN) {
    return { ok: false, error: `Password must be at least ${MIN_LEN} characters` };
  }
  if (password.length > MAX_LEN) {
    return { ok: false, error: `Password must be at most ${MAX_LEN} characters` };
  }
  if (/\s/.test(password)) {
    return { ok: false, error: "Password cannot contain spaces" };
  }
  return { ok: true, password };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function passwordsMatch(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function setUserPassword(userId: string, plain: string): Promise<void> {
  const hash = await hashPassword(plain);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash },
  });
}

export async function clearUserPassword(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: null },
  });
}

export async function userHasPassword(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  return !!row?.passwordHash;
}

type LoginBody = {
  email?: string;
  password?: string;
  client?: string;
  installId?: string;
  deviceName?: string;
  platform?: string;
};

/**
 * Verify email + password. Does not create users (unlike OTP).
 * Returns a generic error for bad credentials so we do not leak account existence.
 */
export async function loginWithPassword(body: LoginBody) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return { ok: false as const, error: "Email and password are required", status: 400 };
  }
  if (!isLoginEmail(email)) {
    return { ok: false as const, error: "Use your PwC email address", status: 400 };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.deactivatedAt) {
    const { ACCOUNT_DEACTIVATED_MESSAGE } = await import("./account-status");
    return { ok: false as const, error: ACCOUNT_DEACTIVATED_MESSAGE, status: 403 };
  }
  if (!user || !user.passwordHash) {
    return { ok: false as const, error: "Email or password is incorrect", status: 401 };
  }
  const match = await passwordsMatch(password, user.passwordHash);
  if (!match) {
    return { ok: false as const, error: "Email or password is incorrect", status: 401 };
  }

  if (body.client === "android") {
    const { token, deviceId } = await issueDeviceToken(user.id, {
      installId: body.installId,
      label: body.deviceName,
      platform: body.platform ?? "android",
    });
    return {
      ok: true as const,
      kind: "device" as const,
      token,
      deviceId,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }

  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });
  return {
    ok: true as const,
    kind: "session" as const,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  };
}
