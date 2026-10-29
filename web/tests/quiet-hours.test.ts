import { describe, expect, it } from "vitest";
import { parseQuietCustomDays, parseQuietHours, parseQuietHoursDays } from "../src/lib/users-admin";

describe("quiet hours parsers", () => {
  it("accepts HH:MM and treats empty as off", () => {
    expect(parseQuietHours("21:00")).toBe("21:00");
    expect(parseQuietHours("")).toBeNull();
    expect(parseQuietHours(null)).toBeNull();
    expect(parseQuietHours(undefined)).toBeUndefined();
    expect(parseQuietHours("9:00 pm")).toBeUndefined();
  });

  it("accepts all, weekdays, and custom", () => {
    expect(parseQuietHoursDays("all")).toBe("all");
    expect(parseQuietHoursDays("weekdays")).toBe("weekdays");
    expect(parseQuietHoursDays("custom")).toBe("custom");
    expect(parseQuietHoursDays("daily")).toBeUndefined();
    expect(parseQuietHoursDays(undefined)).toBeUndefined();
  });

  it("sorts custom weekdays and requires at least one", () => {
    expect(parseQuietCustomDays("5,1,3")).toBe("1,3,5");
    expect(parseQuietCustomDays("1,1,7")).toBe("1,7");
    expect(parseQuietCustomDays("")).toBeUndefined();
    expect(parseQuietCustomDays("0,1")).toBeUndefined();
    expect(parseQuietCustomDays("8")).toBeUndefined();
  });
});
