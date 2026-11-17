import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  otpFindMany: vi.fn(),
  otpCreate: vi.fn(),
  otpUpdate: vi.fn(),
  otpUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  ensureUser: vi.fn(),
  sendTeams: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    otpCode: {
      findMany: mocks.otpFindMany,
      create: mocks.otpCreate,
      update: mocks.otpUpdate,
      updateMany: mocks.otpUpdateMany,
    },
    user: { findUnique: mocks.userFindUnique },
    $queryRawUnsafe: () => {
      throw new Error("tests must use the PGlite runner");
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  ensureUser: mocks.ensureUser,
  isPwcEmail: (e: string) => e.endsWith("@pwc.com"),
  createSession: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({ sendTeamsNotification: mocks.sendTeams }));

import { hit, isLocked, setThrottleSqlRunner, clientIp } from "../src/lib/rate-limit";
import { randomOtp, requestOtp, verifyOtp } from "../src/lib/otp";
import { loginWithPassword } from "../src/lib/password";

const MIG = path.resolve(__dirname, "../prisma/migrations/20261117010000_auth_throttle/migration.sql");
let db: PGlite;
let goodHash: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(MIG, "utf8"));
  setThrottleSqlRunner(async (sql, params) => (await db.query(sql, params as unknown[])).rows as never);
  goodHash = await bcrypt.hash("123456", 4);
}, 60_000);

beforeEach(async () => {
  vi.clearAllMocks();
  await db.exec(`DELETE FROM "AuthThrottle"`);
  mocks.otpFindMany.mockResolvedValue([{ id: "otp-1", codeHash: goodHash }]);
  mocks.otpCreate.mockResolvedValue({ id: "otp-new" });
  mocks.otpUpdate.mockResolvedValue({});
  mocks.otpUpdateMany.mockResolvedValue({ count: 1 });
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.ensureUser.mockResolvedValue({ id: "u1", email: "ada@pwc.com", role: "user", name: "Ada" });
  mocks.sendTeams.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rate-limit hit", () => {
  it("counts atomically, locks at the limit, and resets after the window", async () => {
    const t0 = Date.UTC(2026, 10, 17, 4, 0, 0);
    const a = await hit("k", 3, 60_000, 120_000, t0);
    expect(a).toMatchObject({ allowed: true, locked: false, count: 1 });
    await hit("k", 3, 60_000, 120_000, t0 + 1000);
    const c = await hit("k", 3, 60_000, 120_000, t0 + 2000);
    expect(c).toMatchObject({ allowed: true, locked: true, count: 3 });
    expect(c.retryAfterSeconds).toBe(120);
    expect(await isLocked("k", t0 + 3000)).toBe(119);
    const later = await hit("k", 3, 60_000, 120_000, t0 + 200_000);
    expect(later).toMatchObject({ count: 1, locked: false });
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("OTP", () => {
  it("uses crypto, not Math.random, for codes", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/lib/otp.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random/);
    expect(src).toMatch(/randomInt\(100000, 1000000\)/);
    for (let i = 0; i < 50; i++) expect(randomOtp()).toMatch(/^\d{6}$/);
  });

  it("locks after 5 bad codes, burns unused codes, and answers 429 before bcrypt", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await verifyOtp("ada@pwc.com", "000000", "9.9.9.9");
      expect(r).toMatchObject({ ok: false, status: 401, error: "Invalid or expired code" });
    }
    const fifth = await verifyOtp("ada@pwc.com", "000000", "9.9.9.9");
    expect(fifth).toMatchObject({ ok: false, status: 429 });
    expect((fifth as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(890);
    expect(mocks.otpUpdateMany).toHaveBeenCalledWith({
      where: { email: "ada@pwc.com", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    const compare = vi.spyOn(bcrypt, "compare");
    const sixth = await verifyOtp("ada@pwc.com", "123456", "9.9.9.9");
    expect(sixth).toMatchObject({ ok: false, status: 429 });
    expect(compare).not.toHaveBeenCalled();
    expect(mocks.ensureUser).not.toHaveBeenCalled();

    const asked = await requestOtp("ada@pwc.com", "9.9.9.9");
    expect(asked).toMatchObject({ ok: false, status: 429 });
    expect(mocks.otpCreate).not.toHaveBeenCalled();
  });

  it("clears the failure counter on success", async () => {
    for (let i = 0; i < 3; i++) await verifyOtp("bo@pwc.com", "000000", "1.1.1.1");
    const ok = await verifyOtp("bo@pwc.com", "123456", "1.1.1.1");
    expect(ok.ok).toBe(true);
    const rows = await db.query(`SELECT * FROM "AuthThrottle" WHERE key = 'otp_fail:bo@pwc.com'`);
    expect(rows.rows).toHaveLength(0);
    for (let i = 0; i < 4; i++) {
      expect((await verifyOtp("bo@pwc.com", "000000", "1.1.1.1")).status).toBe(401);
    }
  });

  it("limits code requests to 5 per email per hour and stores userId", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-7", deactivatedAt: null });
    for (let i = 0; i < 5; i++) {
      expect((await requestOtp("cy@pwc.com", "2.2.2.2")).ok).toBe(true);
    }
    expect(mocks.otpCreate.mock.calls[0][0].data.userId).toBe("user-7");
    const sixth = await requestOtp("cy@pwc.com", "2.2.2.2");
    expect(sixth).toMatchObject({ ok: false, status: 429 });
    expect(mocks.otpCreate).toHaveBeenCalledTimes(5);
  });

  it("limits code requests to 30 per IP per hour", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await requestOtp(`p${i}@pwc.com`, "3.3.3.3")).ok).toBe(true);
    }
    expect(await requestOtp("p99@pwc.com", "3.3.3.3")).toMatchObject({ status: 429 });
    expect((await requestOtp("p99@pwc.com", "4.4.4.4")).ok).toBe(true);
  }, 30_000);
});

describe("password sign in", () => {
  it("locks the email after 5 failures and checks the lock before bcrypt", async () => {
    const hash = await bcrypt.hash("correct-horse", 4);
    mocks.userFindUnique.mockResolvedValue({
      id: "u2",
      email: "dee@pwc.com",
      role: "user",
      name: "Dee",
      passwordHash: hash,
      deactivatedAt: null,
    });
    for (let i = 0; i < 4; i++) {
      const r = await loginWithPassword({ email: "dee@pwc.com", password: "wrong-pass" }, "5.5.5.5");
      expect(r).toMatchObject({ ok: false, status: 401, error: "Email or password is incorrect" });
    }
    expect(await loginWithPassword({ email: "dee@pwc.com", password: "wrong-pass" }, "5.5.5.5")).toMatchObject({
      status: 429,
    });
    const compare = vi.spyOn(bcrypt, "compare");
    const locked = await loginWithPassword({ email: "dee@pwc.com", password: "correct-horse" }, "5.5.5.5");
    expect(locked).toMatchObject({ ok: false, status: 429 });
    expect(compare).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(5);
  });

  it("counts unknown accounts the same way, so existence is not revealed", async () => {
    for (let i = 0; i < 4; i++) {
      expect(
        await loginWithPassword({ email: "ghost@pwc.com", password: "whatever1" }, "6.6.6.6"),
      ).toMatchObject({ status: 401, error: "Email or password is incorrect" });
    }
    expect(await loginWithPassword({ email: "ghost@pwc.com", password: "whatever1" }, "6.6.6.6")).toMatchObject({
      status: 429,
    });
  });

  it("locks an IP after 50 failures across emails", async () => {
    for (let i = 0; i < 49; i++) {
      await loginWithPassword({ email: `x${i}@pwc.com`, password: "whatever1" }, "7.7.7.7");
    }
    const fiftieth = await loginWithPassword({ email: "x50@pwc.com", password: "whatever1" }, "7.7.7.7");
    expect(fiftieth).toMatchObject({ status: 429 });
    expect(await loginWithPassword({ email: "fresh@pwc.com", password: "whatever1" }, "7.7.7.7")).toMatchObject({
      status: 429,
    });
    expect(await loginWithPassword({ email: "fresh@pwc.com", password: "whatever1" }, "8.8.8.8")).toMatchObject({
      status: 401,
    });
  }, 30_000);
});
