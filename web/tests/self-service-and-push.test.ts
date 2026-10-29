import { describe, expect, it } from "vitest";
import { inPresencePingWindow, shouldNotifyAppUpdate } from "../src/lib/app-update";

describe("shouldNotifyAppUpdate", () => {
  it("skips when nothing is published", () => {
    expect(shouldNotifyAppUpdate(1, 0, null)).toBe(false);
    expect(shouldNotifyAppUpdate(1, null, null)).toBe(false);
  });

  it("skips phones that have not reported a version", () => {
    expect(shouldNotifyAppUpdate(null, 9, null)).toBe(false);
  });

  it("skips phones already on the published version", () => {
    expect(shouldNotifyAppUpdate(9, 9, null)).toBe(false);
    expect(shouldNotifyAppUpdate(10, 9, null)).toBe(false);
  });

  it("notifies an older phone once", () => {
    expect(shouldNotifyAppUpdate(8, 9, null)).toBe(true);
    expect(shouldNotifyAppUpdate(8, 9, 8)).toBe(true);
    expect(shouldNotifyAppUpdate(8, 9, 9)).toBe(false);
  });
});

describe("inPresencePingWindow", () => {
  it("is open on a weekday afternoon in Kolkata", () => {
    // Wed 29 Oct 2026 10:00 IST
    expect(inPresencePingWindow(new Date("2026-10-29T04:30:00Z"), "Asia/Kolkata")).toBe(true);
  });

  it("is closed at night and on Sunday", () => {
    expect(inPresencePingWindow(new Date("2026-10-29T16:30:00Z"), "Asia/Kolkata")).toBe(false);
    // Sunday 1 Nov 2026 10:00 IST
    expect(inPresencePingWindow(new Date("2026-11-01T04:30:00Z"), "Asia/Kolkata")).toBe(false);
  });
});
