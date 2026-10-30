import { describe, expect, it } from "vitest";
import { buttonLabel, classifyCorrection, futureTimeError } from "../src/lib/correction-approval";
import { canDecideOwnCorrection, isMonthLocked, readKeptDayRows, retainOutsideRange, withKeptDayRows } from "../src/lib/corrections-rules";
import { countsAs, pointsCounted, pointsMeterLabel } from "../src/lib/points-format";

describe("corrections month lock", () => {
  it("locks after month end plus window days", () => {
    const before = new Date("2026-11-05T12:00:00.000Z");
    const after = new Date("2026-11-06T00:00:01.000Z");
    expect(isMonthLocked("2026-10-15", 5, before)).toBe(false);
    expect(isMonthLocked("2026-10-15", 5, after)).toBe(true);
  });

  it("rejects bad day keys", () => {
    expect(isMonthLocked("bad", 5, new Date())).toBe(true);
  });
});

describe("sole admin may decide own correction", () => {
  it("allows only when exactly one active admin", () => {
    expect(canDecideOwnCorrection(1)).toBe(true);
    expect(canDecideOwnCorrection(0)).toBe(false);
    expect(canDecideOwnCorrection(2)).toBe(false);
  });
});

describe("replace one local correction day", () => {
  it("preserves both sides of a stored visit that crosses the replacement day", () => {
    const retained = retainOutsideRange(
      new Date("2026-10-27T17:30:00.000Z"),
      new Date("2026-10-29T03:30:00.000Z"),
      new Date("2026-10-27T18:30:00.000Z"),
      new Date("2026-10-28T18:30:00.000Z"),
    );
    expect(retained).toEqual([
      {
        startAt: new Date("2026-10-27T17:30:00.000Z"),
        endAt: new Date("2026-10-27T18:30:00.000Z"),
      },
      {
        startAt: new Date("2026-10-28T18:30:00.000Z"),
        endAt: new Date("2026-10-29T03:30:00.000Z"),
      },
    ]);
  });

  it("removes a stored visit wholly inside the replacement day", () => {
    expect(
      retainOutsideRange(
        new Date("2026-10-28T03:30:00.000Z"),
        new Date("2026-10-28T12:30:00.000Z"),
        new Date("2026-10-27T18:30:00.000Z"),
        new Date("2026-10-28T18:30:00.000Z"),
      ),
    ).toEqual([]);
  });
});

describe("undo keeps the replaced day", () => {
  it("stores the removed visit and reads it back", () => {
    const applied = withKeptDayRows(
      { office_id: "kol", in_at: "2026-10-28T04:00:00.000Z", out_at: "2026-10-28T12:30:00.000Z" },
      {
        visits: [
          {
            id: "visit-1",
            startAt: "2026-10-28T03:30:00.000Z",
            endAt: "2026-10-28T12:00:00.000Z",
            source: "admin",
            reason: "Imported",
            editedBy: null,
            officeLocationId: "kol",
            pointsAwarded: 1,
            correctionId: null,
          },
        ],
        exclusions: [],
        fragmentVisitIds: ["fragment-1"],
        fragmentExclusionIds: [],
      },
    );
    expect(readKeptDayRows(applied)?.visits[0].id).toBe("visit-1");
    expect(readKeptDayRows(applied)?.fragmentVisitIds).toEqual(["fragment-1"]);
    expect(readKeptDayRows({ remove: true })).toBeNull();
  });
});

describe("auto approve classifier", () => {
  const base = {
    requiresApproval: false,
    isAdminSelf: false,
    autoApprovedThisMonth: 0,
    limit: 4,
    requireSync: true,
    hasPhoneData: true,
  };

  it("auto approves when safeguards pass", () => {
    expect(classifyCorrection(base)).toEqual({ outcome: "auto_approved", reason: null });
    expect(buttonLabel("auto_approved", "review")).toBe("Save correction");
    expect(buttonLabel("auto_approved", "today")).toBe("Save changes");
  });

  it("stays pending when an admin must approve each one", () => {
    expect(classifyCorrection({ ...base, requiresApproval: true }).outcome).toBe("pending");
  });

  it("does not auto approve the fifth correction in the month", () => {
    const result = classifyCorrection({ ...base, autoApprovedThisMonth: 4 });
    expect(result).toEqual({ outcome: "pending", reason: "Over 4 this month." });
    expect(buttonLabel("pending", "review")).toBe("Send for approval");
  });

  it("asks an admin when the phone sent no data", () => {
    expect(classifyCorrection({ ...base, hasPhoneData: false }).reason).toBe("No phone data that day.");
    expect(classifyCorrection({ ...base, hasPhoneData: false, requireSync: false }).outcome).toBe(
      "auto_approved",
    );
  });

  it("never auto approves an admin on their own data", () => {
    expect(classifyCorrection({ ...base, isAdminSelf: true })).toEqual({
      outcome: "pending",
      reason: "Admins cannot auto approve their own corrections.",
    });
  });

  it("rejects a time later than now and allows Still In", () => {
    const now = new Date("2026-10-27T06:44:00.000Z");
    expect(
      futureTimeError([{ inAt: "2026-10-27T07:00:00.000Z", outAt: "2026-10-27T08:00:00.000Z" }], now),
    ).toBe("Times cannot be later than now");
    expect(futureTimeError([{ inAt: "2026-10-27T03:45:00.000Z", outAt: null }], now)).toBeNull();
  });

  it("rejects undo after the month lock window", () => {
    const open = new Date("2026-11-03T12:00:00.000Z");
    const locked = new Date("2026-11-06T00:00:00.000Z");
    expect(isMonthLocked("2026-10-15", 5, open)).toBe(false);
    expect(isMonthLocked("2026-10-15", 5, locked)).toBe(true);
  });
});

describe("points-format UI helpers", () => {
  it("uses points copy", () => {
    expect(pointsMeterLabel(5, 8).main).toContain("points");
    expect(pointsMeterLabel(5, 8).side).toBe("3 to go");
    expect(pointsMeterLabel(8, 8).side).toBe("Goal met");
    expect(countsAs(2)).toBe("Counts as 2 points");
    expect(pointsCounted(1)).toBe("1 point counted");
  });
});
