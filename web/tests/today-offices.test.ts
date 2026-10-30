import { describe, expect, it } from "vitest";
import { groupTodayOffices } from "../src/lib/today-offices";

const tz = "Asia/Kolkata";
const today = "2026-10-30";
const names = new Map([
  ["egl", "My EGL"],
  ["blr", "Fake BLR Office"],
]);

describe("groupTodayOffices", () => {
  it("keeps correction visits that start today, each under its own office", () => {
    const groups = groupTodayOffices(
      [
        {
          startAt: new Date("2026-10-29T22:37:00.000Z"),
          endAt: new Date("2026-10-29T22:38:00.000Z"),
          officeLocationId: "egl",
        },
        {
          startAt: new Date("2026-10-30T11:38:00.000Z"),
          endAt: new Date("2026-10-30T15:21:00.000Z"),
          officeLocationId: "blr",
        },
        {
          startAt: new Date("2026-10-29T17:07:00.000Z"),
          endAt: new Date("2026-10-29T18:00:00.000Z"),
          officeLocationId: "egl",
        },
      ],
      today,
      tz,
      names,
    );
    expect(groups.map((g) => g.office_id)).toEqual(["egl", "blr"]);
    expect(groups.map((g) => g.name)).toEqual(["My EGL", "Fake BLR Office"]);
    expect(groups[0].visits).toHaveLength(1);
    expect(groups[1].visits).toHaveLength(1);
  });
});
