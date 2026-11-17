import { beforeEach, describe, expect, it, vi } from "vitest";

type U = {
  id: string;
  email: string;
  name: string;
  managerId: string | null;
  teamId: string | null;
  homeOfficeId: string | null;
  deactivatedAt: Date | null;
  status?: Record<string, unknown> | null;
};
type Where = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  users: [] as U[],
  teams: [] as { id: string; name: string; leadUserId: string | null }[],
  requests: [] as Record<string, unknown>[],
  policy: { managersDecideCorrections: true, monthlyPointsTarget: 8, timezone: "Asia/Kolkata" } as Record<string, unknown>,
  actor: null as null | { user: Record<string, unknown>; device: null; viewAs?: unknown },
  audit: vi.fn(),
  decide: vi.fn(),
  update: vi.fn(),
}));

function matches(u: U, where: Where | undefined): boolean {
  if (!where) return true;
  if ("deactivatedAt" in where && where.deactivatedAt === null && u.deactivatedAt) return false;
  const id = where.id as string | { not?: string; in?: string[] } | undefined;
  if (typeof id === "string" && u.id !== id) return false;
  if (id && typeof id === "object") {
    if (id.not && u.id === id.not) return false;
    if (id.in && !id.in.includes(u.id)) return false;
  }
  const or = where.OR as Where[] | undefined;
  if (or) {
    const team = mocks.teams.find((t) => t.id === u.teamId);
    const ok = or.some((c) => {
      if ("managerId" in c) return u.managerId === c.managerId;
      const lead = (c.team as { leadUserId?: string } | undefined)?.leadUserId;
      if (lead) return team?.leadUserId === lead;
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async ({ where }: { where?: Where } = {}) =>
        mocks.users.filter((u) => matches(u, where)).map((u) => ({ ...u, team: mocks.teams.find((t) => t.id === u.teamId) ?? null })),
      ),
      findFirst: vi.fn(async ({ where }: { where?: Where }) => mocks.users.find((u) => matches(u, where)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = mocks.users.find((x) => x.id === where.id);
        return u ? { ...u, team: mocks.teams.find((t) => t.id === u.teamId) ?? null } : null;
      }),
      update: mocks.update,
    },
    team: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.teams.find((t) => t.id === where.id) ?? null) },
    presenceExceptionDay: { findMany: vi.fn(async () => [{ userId: "a", dayKey: "2026-11-13" }]) },
    leaveDay: { findMany: vi.fn(async () => []) },
    holiday: { findMany: vi.fn(async () => []) },
    currentStatus: { findMany: vi.fn(async () => []) },
    visitCorrectionRequest: {
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async ({ where }: { where: { userId?: { in?: string[] } | string } }) =>
        mocks.requests.filter((r) => {
          const w = where.userId;
          if (typeof w === "string") return r.userId === w;
          return !w?.in || w.in.includes(r.userId as string);
        }),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.requests.find((r) => r.id === where.id) ?? null),
    },
    officeLocation: { findMany: vi.fn(async () => []) },
    auditLog: { create: mocks.audit },
  },
}));
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => mocks.policy) }));
vi.mock("@/lib/corrections", () => ({ decideCorrection: mocks.decide }));
vi.mock("@/lib/pending-corrections-cache", () => ({ invalidatePendingCorrectionsCount: vi.fn() }));
vi.mock("@/lib/actor", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/actor")>();
  return {
    ...real,
    resolveActor: vi.fn(async () => mocks.actor),
    requireRealAdminActor: vi.fn(async () => mocks.actor ?? real.unauthorized()),
  };
});
vi.mock("@/lib/presence", () => ({
  monthKeyInTz: () => "2026-11",
  computeUserMonth: vi.fn(async () => ({
    monthKey: "2026-11",
    timezone: "Asia/Kolkata",
    rules: {},
    summary: { points: 5, visitDays: 4, target: 8, targetMet: false, remaining: 3 },
    days: [
      {
        dayKey: "2026-11-12",
        points: 1,
        hours: 7.5,
        officeName: "Gurugram",
        lat: 28.4,
        lng: 77.1,
        offices: [{ name: "Gurugram", minutes: 450 }],
        intervals: [
          { startAt: "2026-11-12T03:30:00.000Z", endAt: "2026-11-12T11:00:00.000Z", hours: 7.5, deviceName: "Pixel 8", wifiSsid: "PwC" },
        ],
        exception: null,
      },
      { dayKey: "2026-11-13", points: 1, hours: 0, officeName: null, intervals: [], exception: { id: "ex1", points: 1 } },
    ],
  })),
}));
vi.mock("@/lib/employee-records", () => ({
  employeeMonthRecords: vi.fn(async () => ({
    holidays: [],
    leaveDays: [{ dayKey: "2026-11-20", kind: "leave", note: "Family visit", source: "self" }],
    exceptionDays: [{ dayKey: "2026-11-13", points: 1, officeName: "Gurugram", reason: "Medical, HR-2291", grantedBy: "Anjali" }],
  })),
}));

import { canManage, managedUserIds, wouldCreateManagerCycle } from "../src/lib/team-scope";
import { parseTeamCsv, planTeamImport } from "../src/lib/team-import";
import { teamMemberMonth, teamStatus, workingDaysLeft } from "../src/lib/team-view";
import { GET as teamStatusGet } from "../src/app/api/team/status/route";
import { POST as teamCorrectionsPost, GET as teamCorrectionsGet } from "../src/app/api/team/corrections/route";
import { GET as memberMonthGet } from "../src/app/api/team/people/[userId]/month/route";
import { PATCH as userPatch } from "../src/app/api/admin/users/[id]/route";

function user(id: string, over: Partial<U> = {}): U {
  return { id, email: `${id}@pwc.com`, name: id.toUpperCase(), managerId: null, teamId: null, homeOfficeId: "gur", deactivatedAt: null, ...over };
}

function as(id: string, viewAs?: unknown) {
  const u = mocks.users.find((x) => x.id === id)!;
  mocks.actor = { user: { ...u, role: "user" }, device: null, viewAs };
}

function post(body: unknown) {
  return new Request("http://x/api/team/corrections", { method: "POST", body: JSON.stringify(body) });
}

const FORBIDDEN_KEYS = /"(lat|lng|latitude|longitude|hours|hoursToday|deviceName|lastDeviceName|wifi\w*|reason|note|offices|intervals)"/;

beforeEach(() => {
  mocks.users = [
    user("mgr"),
    user("a", { managerId: "mgr" }),
    user("b", { managerId: "a" }),
    user("c", { managerId: "other", teamId: "t1" }),
    user("d"),
    user("e", { managerId: "mgr", deactivatedAt: new Date() }),
    user("other"),
  ];
  mocks.teams = [{ id: "t1", name: "Audit North", leadUserId: "mgr" }];
  mocks.requests = [
    { id: "r-a", userId: "a", dayKey: "2026-11-12", status: "pending", requested: null, proposedStart: new Date(), proposedEnd: new Date(), reason: "Phone died", createdAt: new Date(), user: { id: "a", email: "a@pwc.com" } },
    { id: "r-b", userId: "b", dayKey: "2026-11-12", status: "pending", requested: null, proposedStart: new Date(), proposedEnd: new Date(), reason: "x", createdAt: new Date(), user: { id: "b", email: "b@pwc.com" } },
    { id: "r-mgr", userId: "mgr", dayKey: "2026-11-12", status: "pending", requested: null, proposedStart: new Date(), proposedEnd: new Date(), reason: "x", createdAt: new Date(), user: { id: "mgr", email: "mgr@pwc.com" } },
  ];
  mocks.policy.managersDecideCorrections = true;
  mocks.audit.mockReset();
  mocks.decide.mockReset();
  mocks.decide.mockImplementation(async ({ row, decision }: { row: { id: string }; decision: string }) => ({
    request: { id: row.id, status: decision === "approve" ? "approved" : "rejected" },
  }));
  mocks.update.mockReset();
  mocks.update.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }));
  as("mgr");
});

describe("team scope", () => {
  it("covers direct reports and members of teams the person leads", async () => {
    expect((await managedUserIds("mgr")).sort()).toEqual(["a", "c"]);
  });

  it("leaves out grand-reports, other people, deactivated people and the manager", async () => {
    const ids = await managedUserIds("mgr");
    expect(ids).not.toContain("b");
    expect(ids).not.toContain("d");
    expect(ids).not.toContain("e");
    expect(ids).not.toContain("mgr");
    expect(await canManage("mgr", "b")).toBe(false);
    expect(await canManage("mgr", "c")).toBe(true);
    expect(await canManage("mgr", "mgr")).toBe(false);
  });

  it("blocks manager loops", () => {
    const chain = new Map<string, string | null>([["mgr", null], ["a", "mgr"], ["b", "a"]]);
    expect(wouldCreateManagerCycle("mgr", "b", chain)).toBe(true);
    expect(wouldCreateManagerCycle("a", "a", chain)).toBe(true);
    expect(wouldCreateManagerCycle("b", "mgr", chain)).toBe(false);
    expect(wouldCreateManagerCycle("b", null, chain)).toBe(false);
  });
});

describe("team CSV import", () => {
  const people = [
    { id: "mgr", email: "mgr@pwc.com", managerId: null },
    { id: "a", email: "a@pwc.com", managerId: "mgr" },
    { id: "b", email: "b@pwc.com", managerId: null },
  ];

  it("plans updates, new teams and skips problem rows", () => {
    const { rows } = parseTeamCsv(
      "email,managerEmail,teamName\nb@pwc.com,a@pwc.com,Tax\nx@pwc.com,a@pwc.com,\nb@pwc.com,ghost@pwc.com,\nmgr@pwc.com,b@pwc.com,\na@pwc.com,,Audit North",
    );
    const plan = planTeamImport(rows, people, ["Audit North"]);
    expect(plan.changes.map((c) => c.email)).toEqual(["b@pwc.com", "a@pwc.com"]);
    expect(plan.newTeams).toEqual(["Tax"]);
    expect(plan.problems.map((p) => p.error)).toEqual(["Unknown person", "Unknown manager", "Manager loop"]);
  });
});

describe("manager APIs", () => {
  it("returns 403 for people with no reports", async () => {
    as("d");
    expect((await teamStatusGet(new Request("http://x/api/team/status"))).status).toBe(403);
    expect((await memberMonthGet(new Request("http://x"), { params: Promise.resolve({ userId: "a" }) })).status).toBe(403);
  });

  it("refuses a member page outside scope", async () => {
    expect((await memberMonthGet(new Request("http://x"), { params: Promise.resolve({ userId: "b" }) })).status).toBe(403);
    expect((await memberMonthGet(new Request("http://x"), { params: Promise.resolve({ userId: "a" }) })).status).toBe(200);
  });

  it("never sends coordinates, hours, devices, Wi-Fi or HR reasons", async () => {
    mocks.users[1].status = { inOffice: true, sinceAt: new Date(), officeName: "Gurugram", monthPoints: 5, hoursToday: 6.5, lastDeviceName: "Pixel 8", lat: 28.4 };
    const month = await teamMemberMonth("a", "2026-11");
    const status = await teamStatus(["a", "c"]);
    expect(JSON.stringify(month)).not.toMatch(FORBIDDEN_KEYS);
    expect(JSON.stringify(status)).not.toMatch(FORBIDDEN_KEYS);
    expect(month?.pointsTarget).toBe(8);
    expect(month?.days.find((d) => d.dayKey === "2026-11-13")?.exception).toEqual({ points: 1, officeName: "Gurugram" });
    expect(status.people.find((p) => p.id === "a")).toMatchObject({ monthPoints: 5, pointsTarget: 8, goalMet: false, exceptionDays: 1 });
  });

  it("counts working days left without weekends or holidays", () => {
    expect(workingDaysLeft("2026-11-25", "2026-11-30", new Set(["2026-11-27"]))).toBe(3);
  });

  it("lists only in-scope pending requests, never the manager's own", async () => {
    const res = await teamCorrectionsGet(new Request("http://x/api/team/corrections"));
    const j = (await res.json()) as { requests: { id: string }[] };
    expect(j.requests.map((r) => r.id)).toEqual(["r-a"]);
  });
});

describe("manager correction decisions", () => {
  it("approves an in-scope request and logs it", async () => {
    const res = await teamCorrectionsPost(post({ id: "r-a", decision: "approve" }));
    expect(res.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ actorId: "mgr", decision: "approve" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "correction.manager_approve" }) }));
  });

  it("needs a note to mark not approved", async () => {
    expect((await teamCorrectionsPost(post({ id: "r-a", decision: "reject" }))).status).toBe(400);
    expect((await teamCorrectionsPost(post({ id: "r-a", decision: "reject", reviewNote: "Not in office" }))).status).toBe(200);
  });

  it("refuses own, out-of-scope and revert", async () => {
    expect((await teamCorrectionsPost(post({ id: "r-mgr", decision: "approve" }))).status).toBe(403);
    expect((await teamCorrectionsPost(post({ id: "r-b", decision: "approve" }))).status).toBe(403);
    expect((await teamCorrectionsPost(post({ id: "r-a", decision: "revert" }))).status).toBe(400);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("is blocked when the rule is off", async () => {
    mocks.policy.managersDecideCorrections = false;
    expect((await teamCorrectionsPost(post({ id: "r-a", decision: "approve" }))).status).toBe(403);
    expect((await teamCorrectionsGet(new Request("http://x"))).status).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});

describe("Users drawer manager field", () => {
  function patch(id: string, body: unknown) {
    return userPatch(new Request(`http://x/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
      params: Promise.resolve({ id }),
    });
  }

  it("blocks a loop and saves a valid manager", async () => {
    mocks.actor = { user: { id: "admin", role: "admin" }, device: null };
    const loop = await patch("mgr", { managerId: "b" });
    expect(loop.status).toBe(400);
    expect(((await loop.json()) as { error: string }).error).toMatch(/loop/);
    expect((await patch("b", { managerId: "mgr" })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ managerId: "mgr" }) }));
  });
});
