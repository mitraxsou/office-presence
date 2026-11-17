import { describe, expect, it } from "vitest";
import { isNotSyncing } from "../src/lib/roster";

const H = 3_600_000;
// Tuesday 17 Nov 2026 12:00 IST, and Saturday 21 Nov.
const TUE = Date.parse("2026-11-17T06:30:00Z");
const SAT = Date.parse("2026-11-21T06:30:00Z");

describe("roster Not syncing", () => {
  it("flags a phone silent for over 24 hours on a weekday", () => {
    expect(isNotSyncing([new Date(TUE - 25 * H)], TUE, "Asia/Kolkata")).toBe(true);
    expect(isNotSyncing([null], TUE, "Asia/Kolkata")).toBe(true);
  });

  it("does not flag a recent phone, no phone, or a weekend", () => {
    expect(isNotSyncing([new Date(TUE - 25 * H), new Date(TUE - H)], TUE, "Asia/Kolkata")).toBe(false);
    expect(isNotSyncing([], TUE, "Asia/Kolkata")).toBe(false);
    expect(isNotSyncing([new Date(SAT - 48 * H)], SAT, "Asia/Kolkata")).toBe(false);
  });
});
