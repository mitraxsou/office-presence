import { describe, expect, it } from "vitest";
import cases from "../../shared/visit-cases.json";
import { computeVisits, summarizeMonth, type PresenceRules } from "../src/lib/visit-calculator";

type Expected = {
  visitCount: number;
  totalHours: number;
  dayMet: boolean;
  visitDays?: number;
  totalPoints?: number;
  targetMet?: boolean;
  dayKeys?: string[];
  dayHours?: number[];
};

describe("visit-calculator shared cases", () => {
  for (const c of cases.cases as any[]) {
    it(c.id, () => {
      const result = computeVisits({
        rules: c.rules as PresenceRules,
        events: c.events,
        adminVisits: c.adminVisits,
        exclusions: c.exclusions,
        office: c.office,
        offices: c.offices,
      });
      const e = c.expected as Expected;
      expect(result.visits.length).toBe(e.visitCount);
      expect(result.totalHours).toBeCloseTo(e.totalHours, 3);
      expect(result.dayMet).toBe(e.dayMet);
      if (e.visitDays != null) expect(result.visitDays).toBe(e.visitDays);
      if (e.totalPoints != null) expect(result.totalPoints).toBe(e.totalPoints);
      if (e.targetMet != null) expect(result.targetMet).toBe(e.targetMet);
      if (e.dayKeys) expect(result.days.map((d) => d.dayKey)).toEqual(e.dayKeys);
      if (e.dayHours) {
        result.days.forEach((d, i) => expect(d.hours).toBeCloseTo(e.dayHours![i], 3));
      }
    });
  }
});

describe("points rules", () => {
  const rules: PresenceRules = {
    gapMinutes: 15,
    dayHours: 5,
    monthlyDaysTarget: 8,
    monthlyPointsTarget: 8,
    timezone: "Asia/Kolkata",
    fenceRadiusMeters: 100,
  };

  it("kolkata needs 8 visit days for 8 points", () => {
    const offices = [{ id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 }];
    const events = [];
    for (let d = 1; d <= 8; d++) {
      const day = String(d).padStart(2, "0");
      events.push({ type: "enter" as const, at: `2026-10-${day}T04:00:00.000Z`, lat: 22.57, lng: 88.36, accuracyMeters: 10 });
      events.push({ type: "exit" as const, at: `2026-10-${day}T04:10:00.000Z`, lat: 22.57, lng: 88.36, accuracyMeters: 10 });
    }
    const r = computeVisits({ rules, events, offices });
    expect(r.visitDays).toBe(8);
    expect(r.totalPoints).toBe(8);
    expect(r.targetMet).toBe(true);
    const seven = computeVisits({ rules, events: events.slice(0, 14), offices });
    expect(seven.targetMet).toBe(false);
    expect(summarizeMonth(seven.days, 8).remaining).toBe(1);
  });

  it("single in-office fix counts as a visit day with 0 hours", () => {
    const r = computeVisits({
      rules,
      events: [{ type: "check_in", at: "2026-10-27T04:00:00.000Z" }],
    });
    expect(r.visitDays).toBe(1);
    expect(r.totalPoints).toBe(1);
    expect(r.totalHours).toBe(0);
  });

  it("simulated events never award points", () => {
    const r = computeVisits({
      rules,
      events: [
        { type: "check_in", at: "2026-10-27T04:00:00.000Z", simulated: true },
        { type: "check_out", at: "2026-10-27T10:00:00.000Z", simulated: true },
      ],
    });
    expect(r.totalPoints).toBe(0);
    expect(r.visitDays).toBe(0);
  });
});
