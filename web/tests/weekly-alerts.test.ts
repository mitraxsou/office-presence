import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prefs: null as unknown,
  devices: [] as { revokedAt: Date | null; lastSeenAt: Date | null }[],
  upsert: vi.fn(),
  pending: [] as { id: string; payload: unknown }[],
  send: vi.fn(async () => true),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userNotificationPrefs: { findUnique: vi.fn(async () => mocks.prefs) },
    deviceToken: { findMany: vi.fn(async () => mocks.devices) },
    pendingAlert: {
      upsert: mocks.upsert,
      findMany: vi.fn(async () => mocks.pending),
      update: mocks.update,
    },
    user: { findUnique: vi.fn(async () => ({ timezone: "Asia/Kolkata" })) },
  },
}));
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => ({ timezone: "Asia/Kolkata" })) }));
vi.mock("@/lib/notifications", () => ({ sendTeamsNotification: mocks.send }));

import { flushPendingAlerts, queueAlerts } from "../src/lib/presence";
import { hasActivePhone, inQuietHours, isoWeekKey, isWeeklySummaryWindow } from "../src/lib/alert-channel";

// Monday 16 Nov 2026, 10:00 IST and Tuesday 17 Nov 2026, 10:00 IST.
const MONDAY_10 = new Date("2026-11-16T04:30:00Z");
const MONDAY_08 = new Date("2026-11-16T02:30:00Z");
const TUESDAY_10 = new Date("2026-11-17T04:30:00Z");

function args(now: Date) {
  return {
    userId: "u1",
    email: "a@pwc.com",
    name: "A",
    timezone: "Asia/Kolkata",
    today: "2026-11-16",
    monthKey: "2026-11",
    inOffice: false,
    officeName: null,
    summary: { points: 5, target: 8, remaining: 3, targetMet: false, visitDays: 4 } as never,
    hoursToday: 0,
    dayHours: 5,
    now,
  };
}

beforeEach(() => {
  mocks.prefs = null;
  mocks.devices = [];
  mocks.upsert.mockReset();
  mocks.send.mockClear();
  mocks.update.mockReset();
  mocks.pending = [];
});

describe("alert channel helpers", () => {
  it("ISO week key", () => {
    expect(isoWeekKey(MONDAY_10, "Asia/Kolkata")).toBe("2026-W47");
    expect(isoWeekKey(new Date("2027-01-01T06:00:00Z"), "Asia/Kolkata")).toBe("2026-W53");
  });

  it("weekly window is Monday from 09:00 local", () => {
    expect(isWeeklySummaryWindow(MONDAY_10, "Asia/Kolkata")).toBe(true);
    expect(isWeeklySummaryWindow(MONDAY_08, "Asia/Kolkata")).toBe(false);
    expect(isWeeklySummaryWindow(TUESDAY_10, "Asia/Kolkata")).toBe(false);
  });

  it("active phone means not revoked and seen within 7 days", () => {
    const now = MONDAY_10.getTime();
    expect(hasActivePhone([{ revokedAt: null, lastSeenAt: new Date(now - 3 * 86_400_000) }], now)).toBe(true);
    expect(hasActivePhone([{ revokedAt: null, lastSeenAt: new Date(now - 8 * 86_400_000) }], now)).toBe(false);
    expect(hasActivePhone([{ revokedAt: new Date(), lastSeenAt: new Date(now) }], now)).toBe(false);
  });

  it("quiet hours, including a window past midnight", () => {
    const prefs = { quietHoursStart: "22:00", quietHoursEnd: "07:00", quietHoursDays: "all" };
    expect(inQuietHours(prefs, new Date("2026-11-16T17:30:00Z"), "Asia/Kolkata")).toBe(true); // 23:00
    expect(inQuietHours(prefs, new Date("2026-11-16T23:30:00Z"), "Asia/Kolkata")).toBe(true); // 05:00
    expect(inQuietHours(prefs, MONDAY_10, "Asia/Kolkata")).toBe(false);
    expect(inQuietHours({ quietHoursStart: null, quietHoursEnd: null }, MONDAY_10, "Asia/Kolkata")).toBe(false);
  });
});

describe("queueAlerts", () => {
  it("a user with an active phone gets no Teams summary", async () => {
    mocks.devices = [{ revokedAt: null, lastSeenAt: new Date(MONDAY_10.getTime() - 3600_000) }];
    await queueAlerts(args(MONDAY_10));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("a user without a phone gets one on Monday only, keyed by ISO week", async () => {
    await queueAlerts(args(MONDAY_10));
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const where = mocks.upsert.mock.calls[0][0].where.userId_type_dayKey;
    expect(where).toEqual({ userId: "u1", type: "daily_summary", dayKey: "2026-W47" });
    expect(mocks.upsert.mock.calls[0][0].update).toEqual({});

    mocks.upsert.mockReset();
    await queueAlerts(args(TUESDAY_10));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("quiet hours delay sending", async () => {
    mocks.prefs = { quietHoursStart: "09:00", quietHoursEnd: "12:00", quietHoursDays: "all" };
    mocks.pending = [{ id: "p1", payload: { message: "x" } }];
    await flushPendingAlerts("u1", MONDAY_10);
    expect(mocks.send).not.toHaveBeenCalled();
    await flushPendingAlerts("u1", new Date("2026-11-16T08:30:00Z")); // 14:00
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
