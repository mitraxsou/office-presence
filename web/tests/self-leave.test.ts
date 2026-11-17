import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: null as unknown,
  policy: {} as Record<string, unknown>,
  holidays: [] as { dayKey: string; officeLocationId: string | null }[],
  leave: new Map<string, { id: string; dayKey: string; kind: string; note: string | null; source: string }>(),
  audit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    holiday: {
      findMany: vi.fn(async ({ where }: { where: { dayKey: { gte: string }; OR: { officeLocationId: string | null }[] } }) =>
        mocks.holidays.filter(
          (h) => h.dayKey === where.dayKey.gte && where.OR.some((o) => o.officeLocationId === h.officeLocationId),
        ),
      ),
    },
    leaveDay: {
      findUnique: vi.fn(async ({ where }: { where: { userId_dayKey: { dayKey: string } } }) =>
        mocks.leave.get(where.userId_dayKey.dayKey) ?? null,
      ),
      upsert: vi.fn(async ({ create }: { create: { dayKey: string; kind: string; note: string | null; source: string } }) => {
        const row = { id: `l-${create.dayKey}`, ...create };
        mocks.leave.set(create.dayKey, row);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        for (const [k, v] of mocks.leave) if (v.id === where.id) mocks.leave.delete(k);
      }),
    },
    auditLog: { create: mocks.audit },
  },
}));
vi.mock("@/lib/actor", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/lib/actor")>();
  return { ...orig, resolveActor: vi.fn(async () => mocks.actor) };
});
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => mocks.policy) }));

import { DELETE, PUT } from "../src/app/api/me/leave/[date]/route";

const user = { id: "emp", homeOfficeId: "pune", role: "user" };

function put(date: string, body: Record<string, unknown> = { kind: "leave" }) {
  return PUT(new Request(`http://x/api/me/leave/${date}`, { method: "PUT", body: JSON.stringify(body) }), {
    params: Promise.resolve({ date }),
  });
}
function del(date: string) {
  return DELETE(new Request(`http://x/api/me/leave/${date}`, { method: "DELETE" }), { params: Promise.resolve({ date }) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T06:00:00.000Z"));
  mocks.actor = { user, device: null };
  mocks.policy = { allowSelfLeave: true, timezone: "Asia/Kolkata", correctionWindowDays: 5, monthlyPointsTarget: 8 };
  mocks.holidays = [];
  mocks.leave = new Map();
  mocks.audit.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("employee leave", () => {
  it("records leave on a working day and audits it", async () => {
    const res = await put("2026-11-04", { kind: "other_duty", note: "Training" });
    expect(res.status).toBe(200);
    expect(mocks.leave.get("2026-11-04")).toMatchObject({ kind: "other_duty", note: "Training", source: "self" });
    expect(mocks.audit.mock.calls[0][0].data.action).toBe("leave.self_set");
  });

  it("allows last month while it is open", async () => {
    expect((await put("2026-10-30")).status).toBe(200);
  });

  it("refuses when the rule is off", async () => {
    mocks.policy.allowSelfLeave = false;
    expect((await put("2026-11-04")).status).toBe(400);
  });

  it("refuses weekends, holidays and older months", async () => {
    mocks.holidays = [{ dayKey: "2026-11-05", officeLocationId: null }];
    expect((await put("2026-11-07")).status).toBe(400);
    expect((await put("2026-11-05")).status).toBe(400);
    expect((await put("2026-09-30")).status).toBe(400);
  });

  it("refuses a closed month", async () => {
    vi.setSystemTime(new Date("2026-11-17T06:00:00.000Z"));
    const res = await put("2026-10-30");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This month is locked");
  });

  it("is blocked in read-only view-as", async () => {
    mocks.actor = { user, device: null, viewAs: { sessionId: "s", adminId: "a", mode: "readonly" } };
    expect((await put("2026-11-04")).status).toBe(403);
  });

  it("removes own leave but not leave an admin marked", async () => {
    await put("2026-11-04");
    expect((await del("2026-11-04")).status).toBe(200);
    expect(mocks.leave.has("2026-11-04")).toBe(false);
    expect(mocks.audit.mock.calls.at(-1)?.[0].data.action).toBe("leave.self_clear");
    mocks.leave.set("2026-11-06", { id: "l1", dayKey: "2026-11-06", kind: "leave", note: null, source: "admin" });
    expect((await del("2026-11-06")).status).toBe(403);
  });
});
