import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: null as unknown,
  session: null as unknown,
  target: null as unknown,
  audit: vi.fn(),
  deleteMany: vi.fn(async () => ({ count: 2 })),
  count: vi.fn(async () => 2),
}));

vi.mock("@/lib/actor", () => ({
  requireRealAdminActor: vi.fn(async () => mocks.actor),
}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => ({ timezone: "Asia/Kolkata" })) }));
vi.mock("@/lib/presence", () => ({
  computeUserMonth: vi.fn(async () => ({ summary: { points: 3, visitDays: 2 } })),
  monthKeyInTz: () => "2026-11",
}));

vi.mock("@/lib/db", () => {
  const table = () => ({ count: mocks.count, deleteMany: mocks.deleteMany });
  return {
  prisma: {
    user: { findUnique: vi.fn(async () => mocks.target) },
    auditLog: { create: mocks.audit },
    presenceEvent: table(),
    visit: table(),
    visitExclusion: table(),
    pendingAlert: table(),
    currentStatus: table(),
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  };
});

import { POST } from "../src/app/api/admin/reset/route";

const admin = { id: "admin1", email: "admin@pwc.com" };
const testUser = { id: "t1", email: "Test.User@pwc.com", isTestAccount: true, isDummy: false };
const realUser = { id: "r1", email: "real@pwc.com", isTestAccount: false, isDummy: false };

function call(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/admin/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const good = { userId: "t1", confirm: "test.user@pwc.com", reason: "Clean up test run" };

beforeEach(() => {
  mocks.actor = { user: admin, device: null };
  mocks.session = { id: admin.id };
  mocks.target = testUser;
  mocks.audit.mockReset();
  mocks.deleteMany.mockClear();
  delete process.env.ALLOW_REAL_USER_RESET;
});

afterEach(() => {
  delete process.env.ALLOW_REAL_USER_RESET;
});

describe("POST /api/admin/reset", () => {
  it("requires a real admin", async () => {
    mocks.actor = new Response(null, { status: 401 });
    expect((await call(good)).status).toBe(401);
  });

  it("is blocked during view-as", async () => {
    mocks.session = { id: "t1", adminId: admin.id, viewAsSessionId: "s1" };
    expect((await call(good)).status).toBe(403);
  });

  it("requires userId (no global wipe)", async () => {
    const res = await call({ confirm: "RESET", reason: "wipe everything now" });
    expect(res.status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("requires a reason of at least 10 characters", async () => {
    expect((await call({ ...good, reason: "short" })).status).toBe(400);
  });

  it("requires the target email as confirm, case-insensitive", async () => {
    expect((await call({ ...good, confirm: "RESET" })).status).toBe(400);
    expect((await call({ ...good, confirm: "TEST.USER@PWC.COM" })).status).toBe(200);
  });

  it("admins cannot reset themselves", async () => {
    expect((await call({ ...good, userId: admin.id })).status).toBe(403);
  });

  it("blocks real accounts unless ALLOW_REAL_USER_RESET=1", async () => {
    mocks.target = realUser;
    const body = { userId: "r1", confirm: "real@pwc.com", reason: "Clean up test run" };
    const res = await call(body);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Real accounts cannot be reset");
    process.env.ALLOW_REAL_USER_RESET = "1";
    expect((await call(body)).status).toBe(200);
  });

  it("writes an audit row with counts and 3 months before deleting", async () => {
    const res = await call(good);
    expect(res.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    const data = mocks.audit.mock.calls[0][0].data;
    expect(data.action).toBe("presence.reset");
    expect(data.targetId).toBe("t1");
    expect(data.reason).toBe("Clean up test run");
    expect(data.beforeJson.counts).toEqual({ events: 2, visits: 2, exclusions: 2, alerts: 2, statuses: 2 });
    expect(data.beforeJson.months.map((m: { monthKey: string }) => m.monthKey)).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(5);
  });
});
