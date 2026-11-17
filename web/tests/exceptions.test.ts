import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

type StoredDay = { userId: string; dayKey: string; points: number };
type StoredException = {
  id: string;
  userId: string;
  officeLocationId: string;
  pointsPerDay: number;
  startDay: string;
  endDay: string;
  revokedAt: Date | null;
  days: StoredDay[];
};

const mocks = vi.hoisted(() => ({
  policy: {} as Record<string, unknown>,
  users: new Map<string, Record<string, unknown>>(),
  offices: new Map<string, { id: string; name: string; pointsPerVisitDay: number }>(),
  holidays: [] as { dayKey: string; officeLocationId: string | null }[],
  exceptions: [] as StoredException[],
  visitDays: new Map<string, number>(),
  audit: vi.fn(),
  recompute: vi.fn(),
  cookie: null as string | null,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.users.get(where.id) ?? null),
      findMany: vi.fn(async () => []),
    },
    officeLocation: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.offices.get(where.id) ?? null),
      findMany: vi.fn(async () => []),
    },
    holiday: {
      findMany: vi.fn(
        async ({ where }: { where: { dayKey: { gte: string; lte: string }; OR: { officeLocationId: string | null }[] } }) =>
          mocks.holidays.filter(
            (h) =>
              h.dayKey >= where.dayKey.gte &&
              h.dayKey <= where.dayKey.lte &&
              where.OR.some((o) => o.officeLocationId === h.officeLocationId),
          ),
      ),
    },
    presenceException: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> & { days: { create: StoredDay[] } } }) => {
        const row: StoredException = {
          id: `ex${mocks.exceptions.length + 1}`,
          userId: data.userId as string,
          officeLocationId: data.officeLocationId as string,
          pointsPerDay: data.pointsPerDay as number,
          startDay: data.startDay as string,
          endDay: data.endDay as string,
          revokedAt: null,
          days: data.days.create,
        };
        mocks.exceptions.push(row);
        return { ...row, reason: data.reason };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.exceptions.find((e) => e.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
        const row = mocks.exceptions.find((e) => e.id === where.id)!;
        row.revokedAt = data.revokedAt;
        return row;
      }),
      findMany: vi.fn(async () => []),
    },
    presenceExceptionDay: {
      findMany: vi.fn(async ({ where }: { where: { userId: string; dayKey: { gte: string; lte: string } } }) =>
        mocks.exceptions
          .filter((e) => !e.revokedAt && e.userId === where.userId)
          .flatMap((e) =>
            e.days
              .filter((d) => d.dayKey >= where.dayKey.gte && d.dayKey <= where.dayKey.lte)
              .map((d) => ({ ...d, exceptionId: e.id, exception: { officeLocationId: e.officeLocationId } })),
          ),
      ),
    },
    viewAsSession: { findUnique: vi.fn(async () => null) },
    auditLog: { create: mocks.audit },
  },
}));
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => mocks.policy) }));
vi.mock("@/lib/roster", () => ({
  adminRoster: vi.fn(async () => ({ users: [] })),
  filtersFromSearchParams: vi.fn(() => ({})),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "op_session" && mocks.cookie ? { value: mocks.cookie } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
vi.mock("@/lib/presence", async () => {
  const { mergeExceptionDays, summarizeMonth } = await import("../src/lib/visit-calculator");
  const { exceptionDaysForUserMonth } = await import("../src/lib/exception-days");
  return {
    monthKeyInTz: (d: Date) => d.toISOString().slice(0, 7),
    recomputeUserPresence: mocks.recompute,
    computeUserMonth: async (userId: string, monthKey: string) => {
      const visits = [...mocks.visitDays]
        .filter(([k]) => k.startsWith(monthKey))
        .map(([dayKey, points]) => ({ dayKey, points, hours: 6, visited: true, firstIn: null, lastOut: null }));
      const days = mergeExceptionDays(visits as never, await exceptionDaysForUserMonth(userId, monthKey));
      return { days, summary: summarizeMonth(days, 8) };
    },
  };
});

import { grantException, previewException, resolveRange, revokeException, workingDaysBetween } from "../src/lib/exceptions";
import { isMonthLocked } from "../src/lib/corrections-rules";
import { computeVisits, mergeExceptionDays, type PresenceRules } from "../src/lib/visit-calculator";
import { computeUserMonth } from "../src/lib/presence";
import { canGrantExceptions, requireExceptionGranter } from "../src/lib/actor";
import { GET as statusGet } from "../src/app/api/admin/status/route";
import { GET as exceptionsGet } from "../src/app/api/admin/exceptions/route";

const NOW = new Date("2026-11-17T06:00:00.000Z");
const rules: PresenceRules = { gapMinutes: 15, dayHours: 5, monthlyDaysTarget: 8, monthlyPointsTarget: 8, timezone: "Asia/Kolkata", fenceRadiusMeters: 100 };

function grant(over: Partial<Parameters<typeof grantException>[0]> = {}) {
  return grantException({ actorId: "hr", userId: "emp", kind: "days", startDay: "2026-11-16", reason: "Client site", now: NOW, ...over });
}

async function monthPoints(monthKey = "2026-11") {
  return (await computeUserMonth("emp", monthKey)).summary.points;
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16";
  mocks.policy = { timezone: "Asia/Kolkata", correctionWindowDays: 5, allowExceptionsInClosedMonths: true, monthlyPointsTarget: 8 };
  mocks.users = new Map([
    ["emp", { id: "emp", homeOfficeId: "pune", role: "user", deactivatedAt: null }],
    ["hr", { id: "hr", homeOfficeId: "blr", role: "user", canGrantExceptions: true, deactivatedAt: null, email: "hr@pwc.com" }],
    ["plain", { id: "plain", homeOfficeId: "blr", role: "user", canGrantExceptions: false, deactivatedAt: null, email: "p@pwc.com" }],
  ]);
  mocks.offices = new Map([
    ["pune", { id: "pune", name: "Pune", pointsPerVisitDay: 4 }],
    ["blr", { id: "blr", name: "Bengaluru", pointsPerVisitDay: 1 }],
  ]);
  mocks.holidays = [];
  mocks.exceptions = [];
  mocks.visitDays = new Map();
  mocks.cookie = null;
  mocks.audit.mockReset();
  mocks.recompute.mockReset();
});

describe("target stays fixed", () => {
  it("keeps 8 points when exception days are added", () => {
    const result = computeVisits({
      rules,
      events: [],
      exceptionDays: [{ dayKey: "2026-11-16", points: 4, exceptionId: "e1" }],
    });
    expect(result.totalPoints).toBe(4);
    expect(result.targetMet).toBe(false);
    expect(rules.monthlyPointsTarget).toBe(8);
  });
});

describe("HR exception points", () => {
  it("adds 4 for a Pune home office and 1 for Bengaluru", async () => {
    const pune = await grant();
    expect(pune.ok).toBe(true);
    expect(await monthPoints()).toBe(4);
    const blr = await grant({ startDay: "2026-11-17", officeLocationId: "blr" });
    expect(blr.ok).toBe(true);
    expect(await monthPoints()).toBe(5);
  });

  it("skips weekends and holidays in a range", async () => {
    mocks.holidays = [{ dayKey: "2026-11-18", officeLocationId: "pune" }];
    const res = await grant({ startDay: "2026-11-13", endDay: "2026-11-19" });
    expect(res.ok && res.preview.days).toEqual(["2026-11-13", "2026-11-16", "2026-11-17", "2026-11-19"]);
  });

  it("ignores another office's holiday", async () => {
    mocks.holidays = [{ dayKey: "2026-11-17", officeLocationId: "blr" }];
    const res = await previewException({ userId: "emp", kind: "days", startDay: "2026-11-16", endDay: "2026-11-17", now: NOW });
    expect(res.ok && res.preview.days).toEqual(["2026-11-16", "2026-11-17"]);
    expect(workingDaysBetween("2026-11-16", "2026-11-17", new Set(["2026-11-17"]))).toEqual(["2026-11-16"]);
  });

  it("covers every working day of a whole month", async () => {
    const res = await previewException({ userId: "emp", kind: "month", monthKey: "2026-11", now: NOW });
    expect(res.ok && res.preview.days.length).toBe(21);
    expect(res.ok && res.preview.total).toBe(84);
    expect(resolveRange({ kind: "month", monthKey: "2026-02" })).toEqual({ ok: true, startDay: "2026-02-01", endDay: "2026-02-28" });
  });

  it("takes the higher of visit and exception points on one day", () => {
    const merged = mergeExceptionDays(
      [{ dayKey: "2026-11-16", points: 1, hours: 6, visited: true } as never],
      [
        { dayKey: "2026-11-16", points: 4, exceptionId: "a" },
        { dayKey: "2026-11-16", points: 2, exceptionId: "b" },
        { dayKey: "2026-11-17", points: 1, exceptionId: "b" },
      ],
    );
    expect(merged.map((d) => [d.dayKey, d.points])).toEqual([
      ["2026-11-16", 4],
      ["2026-11-17", 1],
    ]);
    const higherVisit = mergeExceptionDays([{ dayKey: "2026-11-16", points: 4, hours: 6, visited: true } as never], [
      { dayKey: "2026-11-16", points: 1, exceptionId: "a" },
    ]);
    expect(higherVisit[0].points).toBe(4);
  });

  it("preview counts only points above the visit already on that day", async () => {
    mocks.visitDays.set("2026-11-16", 1);
    const res = await previewException({ userId: "emp", kind: "days", startDay: "2026-11-16", now: NOW });
    expect(res.ok && res.preview.months[0]).toMatchObject({ before: 1, added: 3, after: 4 });
  });

  it("keeps granted points when the office weight changes later", async () => {
    await grant();
    mocks.offices.set("pune", { id: "pune", name: "Pune", pointsPerVisitDay: 2 });
    expect(await monthPoints()).toBe(4);
  });

  it("revoke removes the points and keeps the row", async () => {
    const res = await grant();
    expect(await monthPoints()).toBe(4);
    const revoked = await revokeException({ actorId: "hr", id: res.ok ? res.exception.id : "", reason: "Entered by mistake", now: NOW });
    expect(revoked.ok).toBe(true);
    expect(mocks.exceptions).toHaveLength(1);
    expect(await monthPoints()).toBe(0);
    expect(mocks.audit.mock.calls.map((c) => c[0].data.action)).toEqual(["exception.grant", "exception.revoke"]);
  });

  it("applies immediately and recomputes", async () => {
    await grant();
    expect(mocks.recompute).toHaveBeenCalledWith("emp");
  });

  it("requires a reason and blocks self grants", async () => {
    expect((await grant({ reason: " " })).ok).toBe(false);
    const self = await grant({ actorId: "emp" });
    expect(!self.ok && self.status).toBe(403);
  });
});

describe("closed months", () => {
  it("needs a confirm and reason, then grants", async () => {
    const oct = { startDay: "2026-10-15" };
    const blocked = await grant(oct);
    expect(!blocked.ok && blocked.status).toBe(409);
    const noReason = await grant({ ...oct, confirmClosedMonth: true });
    expect(!noReason.ok && noReason.status).toBe(409);
    const ok = await grant({ ...oct, confirmClosedMonth: true, closedMonthReason: "Payroll fix" });
    expect(ok.ok).toBe(true);
  });

  it("is refused when the policy turns it off", async () => {
    mocks.policy.allowExceptionsInClosedMonths = false;
    const res = await grant({ startDay: "2026-10-15", confirmClosedMonth: true, closedMonthReason: "x" });
    expect(!res.ok && res.status).toBe(400);
  });

  it("locks in the policy timezone", () => {
    // Window 5 days: October locks at 2026-11-06 00:00 IST = 2026-11-05 18:30 UTC.
    expect(isMonthLocked("2026-10-15", 5, new Date("2026-11-05T18:29:00.000Z"), "Asia/Kolkata")).toBe(false);
    expect(isMonthLocked("2026-10-15", 5, new Date("2026-11-05T18:31:00.000Z"), "Asia/Kolkata")).toBe(true);
    expect(isMonthLocked("2026-10-15", 5, new Date("2026-11-05T18:31:00.000Z"), "UTC")).toBe(false);
  });
});

describe("HR only access", () => {
  async function signIn(id: string) {
    const u = mocks.users.get(id)!;
    mocks.cookie = await new SignJWT({ sub: id, email: u.email, role: u.role, name: null })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  }

  it("lets HR open exceptions but not the roster", async () => {
    await signIn("hr");
    expect((await exceptionsGet(new Request("http://x/api/admin/exceptions"))).status).toBe(200);
    expect((await statusGet(new Request("http://x/api/admin/status"))).status).toBe(403);
  });

  it("refuses a plain user", async () => {
    await signIn("plain");
    const res = await requireExceptionGranter(new Request("http://x"));
    expect(res instanceof Response && res.status).toBe(403);
    expect(canGrantExceptions({ role: "user", canGrantExceptions: false })).toBe(false);
    expect(canGrantExceptions({ role: "admin" })).toBe(true);
  });
});
