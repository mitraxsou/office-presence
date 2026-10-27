import { describe, expect, it } from "vitest";
import { canDecideOwnCorrection, isMonthLocked } from "../src/lib/corrections-rules";
import { countsAs, daysCounted, daysMeterLabel } from "../src/lib/days-format";

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

describe("days-format UI helpers", () => {
  it("uses days copy", () => {
    expect(daysMeterLabel(5, 8).main).toContain("days");
    expect(daysMeterLabel(5, 8).side).toBe("3 to go");
    expect(daysMeterLabel(8, 8).side).toBe("Goal met");
    expect(countsAs(2)).toBe("Counts as 2 days");
    expect(daysCounted(1)).toBe("1 day counted");
  });
});
