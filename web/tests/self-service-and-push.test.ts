import { describe, expect, it } from "vitest";
import {
  appUpdatePushUrl,
  downloadPageUrl,
  inPresencePingWindow,
  shouldNotifyAppUpdate,
  shouldSendDailyAppUpdate,
} from "../src/lib/app-update";

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

describe("shouldSendDailyAppUpdate", () => {
  it("reminds an older phone once each day", () => {
    expect(shouldSendDailyAppUpdate(8, 9, null, "2026-11-18")).toBe(true);
    expect(shouldSendDailyAppUpdate(8, 9, "2026-11-17", "2026-11-18")).toBe(true);
    expect(shouldSendDailyAppUpdate(8, 9, "2026-11-18", "2026-11-18")).toBe(false);
  });

  it("skips current phones and an empty publish", () => {
    expect(shouldSendDailyAppUpdate(9, 9, null, "2026-11-18")).toBe(false);
    expect(shouldSendDailyAppUpdate(null, 9, null, "2026-11-18")).toBe(false);
    expect(shouldSendDailyAppUpdate(8, 0, null, "2026-11-18")).toBe(false);
    expect(shouldSendDailyAppUpdate(8, 9, null, "")).toBe(false);
  });
});

describe("appUpdatePushUrl", () => {
  const apk = "https://cdn.example.com/office-presence.apk";

  it("always uses the download page, including when an APK URL is set", () => {
    const page = downloadPageUrl();
    expect(page.endsWith("/download")).toBe(true);
    expect(appUpdatePushUrl(apk)).toBe(page);
    expect(appUpdatePushUrl(`  ${apk}  `)).toBe(page);
    expect(appUpdatePushUrl("https://cdn.example.com/app-release.apk?v=2")).toBe(page);
    expect(appUpdatePushUrl(null)).toBe(page);
    expect(appUpdatePushUrl(undefined)).toBe(page);
    expect(appUpdatePushUrl("")).toBe(page);
    expect(appUpdatePushUrl("   ")).toBe(page);
    expect(appUpdatePushUrl("http://cdn.example.com/office-presence.apk")).toBe(page);
    expect(appUpdatePushUrl("not-a-url")).toBe(page);
    expect(appUpdatePushUrl("https://")).toBe(page);
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
