import { describe, expect, it } from "vitest";
import { computeVisits, type PresenceRules } from "../src/lib/visit-calculator";

const rules: PresenceRules = {
  gapMinutes: 30,
  dayHours: 4,
  monthlyDaysTarget: 8,
  monthlyPointsTarget: 8,
  timezone: "Asia/Kolkata",
  fenceRadiusMeters: 100,
};

const pune = { id: "pune", lat: 18.52, lng: 73.85, radiusMeters: 100, pointsPerVisitDay: 3 };
const kol = { id: "kolkata", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 };

function visitAt(day: string, officeId: string, pointsAtMatch: number | null) {
  const o = officeId === "pune" ? pune : kol;
  return [
    { type: "enter" as const, at: `${day}T04:00:00.000Z`, lat: o.lat, lng: o.lng, accuracyMeters: 10, officeLocationId: o.id, pointsAtMatch },
    { type: "sample" as const, at: `${day}T04:20:00.000Z`, lat: o.lat, lng: o.lng, accuracyMeters: 10, officeLocationId: o.id, pointsAtMatch },
    { type: "exit" as const, at: `${day}T05:00:00.000Z`, lat: o.lat, lng: o.lng, accuracyMeters: 10, officeLocationId: o.id, pointsAtMatch },
  ];
}

describe("pointsAtMatch snapshots", () => {
  it("office 1 to 3 points leaves last month unchanged and new visits earn 3", () => {
    // Pune now counts 3, but last month's events were matched at 1.
    const lastMonth = computeVisits({
      rules,
      events: visitAt("2026-10-05", "pune", 1),
      offices: [pune],
      now: Date.parse("2026-11-17T00:00:00Z"),
    });
    expect(lastMonth.totalPoints).toBe(1);

    const thisMonth = computeVisits({
      rules,
      events: visitAt("2026-11-05", "pune", 3),
      offices: [pune],
      now: Date.parse("2026-11-17T00:00:00Z"),
    });
    expect(thisMonth.totalPoints).toBe(3);
  });

  it("falls back to the current office weight only for events without a snapshot", () => {
    const r = computeVisits({
      rules,
      events: visitAt("2026-11-05", "pune", null),
      offices: [pune],
      now: Date.parse("2026-11-17T00:00:00Z"),
    });
    expect(r.totalPoints).toBe(3);
  });

  it("admin visit at 2 points stays 2 when the office weight changes", () => {
    const r = computeVisits({
      rules,
      events: [],
      adminVisits: [
        {
          startAt: "2026-11-06T04:00:00.000Z",
          endAt: "2026-11-06T09:00:00.000Z",
          source: "admin",
          officeLocationId: "pune",
          pointsPerVisitDay: 2,
        },
      ],
      offices: [pune],
      now: Date.parse("2026-11-17T00:00:00Z"),
    });
    expect(r.totalPoints).toBe(2);
  });

  it("two offices on one day take the highest snapshot", () => {
    const r = computeVisits({
      rules,
      events: [...visitAt("2026-11-07", "kolkata", 1), ...visitAt("2026-11-07", "pune", 3).map((e) => ({
        ...e,
        at: e.at.replace("T04:", "T07:").replace("T05:", "T08:"),
      }))],
      offices: [pune, kol],
      now: Date.parse("2026-11-17T00:00:00Z"),
    });
    expect(r.days).toHaveLength(1);
    expect(r.totalPoints).toBe(3);
  });
});
