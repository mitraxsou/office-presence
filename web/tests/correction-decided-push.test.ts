import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisitCorrectionRequest } from "@prisma/client";

const mocks = vi.hoisted(() => ({ push: vi.fn(async () => {}) }));

vi.mock("@/lib/db", () => {
  const model = () => ({
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "new", ...a.data })),
    update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "c1", ...a.data })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
  });
  const models = new Map<string, ReturnType<typeof model>>();
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === "$transaction") return async (fn: (tx: unknown) => unknown) => fn(prisma);
        if (key === "user") {
          return { ...model(), findUnique: vi.fn(async () => ({ id: "u1", email: "a@pwc.com", timezone: "Asia/Kolkata" })) };
        }
        if (!models.has(key)) models.set(key, model());
        return models.get(key);
      },
    },
  );
  return { prisma };
});
vi.mock("@/lib/presence", () => ({
  computeUserMonth: vi.fn(),
  recomputeUserPresence: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications", () => ({ sendTeamsNotification: vi.fn(async () => true) }));
vi.mock("@/lib/firebase-admin", () => ({ pushCorrectionDecided: mocks.push }));

import { decideCorrection, revertCorrection } from "../src/lib/corrections";

function row(over: Partial<VisitCorrectionRequest> = {}): VisitCorrectionRequest {
  return {
    id: "c1",
    userId: "u1",
    dayKey: "2026-11-10",
    issue: "missing_visit",
    status: "pending",
    officeLocationId: null,
    proposedStart: new Date("2026-11-10T04:00:00Z"),
    proposedEnd: new Date("2026-11-10T10:00:00Z"),
    requested: null,
    applied: null,
    createdAt: new Date("2026-11-11T04:00:00Z"),
    ...over,
  } as unknown as VisitCorrectionRequest;
}

beforeEach(() => mocks.push.mockClear());

describe("correction_decided push", () => {
  it("sends on admin approve", async () => {
    await decideCorrection({ row: row(), actorId: "admin1", decision: "approve", applied: null, reviewNote: null });
    expect(mocks.push).toHaveBeenCalledWith("u1", { id: "c1", dayKey: "2026-11-10", status: "approved" });
  });

  it("sends on reject", async () => {
    await decideCorrection({ row: row(), actorId: "admin1", decision: "reject", applied: null, reviewNote: "No badge" });
    expect(mocks.push).toHaveBeenCalledWith("u1", { id: "c1", dayKey: "2026-11-10", status: "rejected" });
  });

  it("does not send for an auto-approved correction", async () => {
    await decideCorrection({ row: row(), actorId: null, decision: "approve", applied: null, reviewNote: null, asAuto: true });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("sends on revert", async () => {
    const r = await revertCorrection(row({ status: "approved" }), "admin1", "Wrong office");
    expect(r.ok).toBe(true);
    expect(mocks.push).toHaveBeenCalledWith("u1", { id: "c1", dayKey: "2026-11-10", status: "reverted" });
  });
});
