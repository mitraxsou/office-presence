import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    holiday: {
      findMany: vi.fn(async () => [
        { id: "h1", dayKey: "2026-11-24", name: "Holiday", officeLocationId: null },
        { id: "h2", dayKey: "2026-11-24", name: "Guru Nanak Jayanti", officeLocationId: "pune" },
        { id: "h3", dayKey: "2026-12-25", name: "Christmas", officeLocationId: null },
      ]),
    },
    leaveDay: { findMany: vi.fn(async () => [{ dayKey: "2026-11-19", kind: "leave", note: null, source: "self" }]) },
    presenceExceptionDay: {
      findMany: vi.fn(async () => [
        { dayKey: "2026-11-13", points: 1, exceptionId: "a", exception: { officeLocationId: "blr", reason: "Travel", grantedById: "hr", createdAt: new Date("2026-11-14T05:00:00Z") } },
        { dayKey: "2026-11-13", points: 4, exceptionId: "b", exception: { officeLocationId: "pune", reason: "Client site", grantedById: "hr", createdAt: new Date("2026-11-14T05:00:00Z") } },
      ]),
    },
    presenceException: {
      findMany: vi.fn(async () => [
        { id: "b", createdAt: new Date("2026-11-14T05:00:00Z"), startDay: "2026-11-13", endDay: "2026-11-13", pointsPerDay: 4, officeLocationId: "pune", days: [{ dayKey: "2026-11-13" }] },
      ]),
    },
    user: { findMany: vi.fn(async () => [{ id: "hr", name: "Anjali Desai", firstName: "Anjali", lastName: "Desai", preferredName: null, email: "a@pwc.com", colleagueDisplayMode: "first_last" }]) },
    officeLocation: {
      findMany: vi.fn(async () => [
        { id: "pune", name: "Pune" },
        { id: "blr", name: "Bengaluru" },
      ]),
    },
  },
}));

import { employeeMonthRecords, exceptionsAddedSince } from "../src/lib/employee-records";

describe("employee month records", () => {
  it("returns holidays, leave and the best exception per day for the requested months", async () => {
    const r = await employeeMonthRecords({ id: "emp", homeOfficeId: "pune" }, ["2026-11"]);
    expect(r.holidays).toEqual([{ dayKey: "2026-11-24", name: "Guru Nanak Jayanti" }]);
    expect(r.leaveDays).toEqual([{ dayKey: "2026-11-19", kind: "leave", note: null, source: "self" }]);
    expect(r.exceptionDays).toHaveLength(1);
    expect(r.exceptionDays[0]).toMatchObject({ points: 4, officeName: "Pune", homeOffice: true, reason: "Client site", grantedBy: "Anjali Desai" });
  });

  it("is empty for no months and lists recent grants", async () => {
    expect(await employeeMonthRecords({ id: "emp", homeOfficeId: null }, [])).toEqual({ holidays: [], leaveDays: [], exceptionDays: [] });
    const added = await exceptionsAddedSince("emp", new Date("2026-11-03T00:00:00Z"));
    expect(added).toEqual([
      { id: "b", createdAt: "2026-11-14T05:00:00.000Z", startDay: "2026-11-13", endDay: "2026-11-13", days: ["2026-11-13"], pointsPerDay: 4, officeName: "Pune" },
    ]);
  });
});
