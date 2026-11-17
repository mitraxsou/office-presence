import { beforeEach, describe, expect, it, vi } from "vitest";

type Ev = { id: string; recordedAt: Date; latitude: number | null; longitude: number | null; wifiSsid: string | null; wifiBssid: string | null; officeLocationId: string | null; pointsAtMatch: number | null };

const db = vi.hoisted(() => ({
  events: [] as Ev[],
  audits: [] as unknown[],
  otpWhere: null as unknown,
  throttleWhere: null as unknown,
  viewAsWhere: null as unknown,
}));

vi.mock("@/lib/db", () => {
  const hasPlace = (e: Ev) => e.latitude != null || e.longitude != null || e.wifiSsid != null || e.wifiBssid != null;
  return {
    prisma: {
      presenceEvent: {
        findMany: vi.fn(async (a: { where: { recordedAt: { lt: Date } }; take: number }) =>
          db.events
            .filter((e) => e.recordedAt < a.where.recordedAt.lt && hasPlace(e))
            .slice(0, a.take)
            .map((e) => ({ id: e.id })),
        ),
        updateMany: vi.fn(async (a: { where: { id: { in: string[] } }; data: Partial<Ev> }) => {
          let count = 0;
          for (const e of db.events) {
            if (a.where.id.in.includes(e.id)) {
              Object.assign(e, a.data);
              count += 1;
            }
          }
          return { count };
        }),
      },
      otpCode: { deleteMany: vi.fn(async (a: unknown) => ((db.otpWhere = a), { count: 3 })) },
      authThrottle: { deleteMany: vi.fn(async (a: unknown) => ((db.throttleWhere = a), { count: 1 })) },
      viewAsSession: { deleteMany: vi.fn(async (a: unknown) => ((db.viewAsWhere = a), { count: 0 })) },
      auditLog: { create: vi.fn(async (a: unknown) => db.audits.push(a)) },
    },
  };
});
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => ({ rawLocationRetentionDays: 90 })) }));

import { runRetention } from "../src/lib/retention";

const NOW = new Date("2026-11-17T00:00:00Z");
const DAY = 86_400_000;

function ev(i: number, ageDays: number): Ev {
  return {
    id: `e${i}`,
    recordedAt: new Date(NOW.getTime() - ageDays * DAY),
    latitude: 22.57,
    longitude: 88.36,
    wifiSsid: "PwC",
    wifiBssid: null,
    officeLocationId: "kol",
    pointsAtMatch: 2,
  };
}

beforeEach(() => {
  db.events = [];
  db.audits = [];
});

describe("retention job", () => {
  it("clears coordinates older than the retention window in batches, keeping office and points", async () => {
    db.events = [...Array.from({ length: 7 }, (_, i) => ev(i, 100)), ev(99, 10)];
    const counts = await runRetention({ now: NOW, batchSize: 3 });
    expect(counts.eventsCleared).toBe(7);
    expect(counts.batches).toBe(3);
    expect(counts.done).toBe(true);
    const old = db.events.filter((e) => e.id !== "e99");
    expect(old.every((e) => e.latitude == null && e.longitude == null && e.wifiSsid == null)).toBe(true);
    expect(old.every((e) => e.officeLocationId === "kol" && e.pointsAtMatch === 2)).toBe(true);
    expect(db.events.find((e) => e.id === "e99")!.latitude).toBe(22.57);
  });

  it("is idempotent", async () => {
    db.events = [ev(1, 100), ev(2, 100)];
    await runRetention({ now: NOW });
    const second = await runRetention({ now: NOW });
    expect(second.eventsCleared).toBe(0);
    expect(second.batches).toBe(1);
  });

  it("deletes day-old sign-in codes, idle throttles, old view-as sessions, and audits the counts", async () => {
    const counts = await runRetention({ now: NOW });
    expect(counts).toMatchObject({ otpCodesDeleted: 3, throttlesDeleted: 1, viewAsSessionsDeleted: 0 });
    expect(db.otpWhere).toEqual({ where: { createdAt: { lt: new Date(NOW.getTime() - DAY) } } });
    expect(JSON.stringify(db.viewAsWhere)).toContain(new Date(NOW.getTime() - 180 * DAY).toISOString());
    expect(db.audits).toHaveLength(1);
    expect((db.audits[0] as { data: { action: string } }).data.action).toBe("privacy.retention");
  });
});
