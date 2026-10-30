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

  it("a geofence exit that is back inside the gap stays one visit", () => {
    const offices = [{ id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 }];
    const r = computeVisits({
      rules,
      offices,
      events: [
        { type: "enter", at: "2026-10-30T00:18:39.417Z", officeLocationId: "kol", accuracyMeters: 2 },
        { type: "exit", at: "2026-10-30T00:33:39.864Z", officeLocationId: "kol", accuracyMeters: 20 },
        { type: "enter", at: "2026-10-30T00:33:40.626Z", officeLocationId: "kol", accuracyMeters: 2 },
        { type: "exit", at: "2026-10-30T01:10:44.569Z", officeLocationId: "kol", accuracyMeters: 100 },
        { type: "enter", at: "2026-10-30T01:13:39.329Z", officeLocationId: "kol", accuracyMeters: 2 },
        { type: "exit", at: "2026-10-30T01:33:39.462Z", officeLocationId: "kol", accuracyMeters: 20 },
      ],
    });
    expect(r.visits.length).toBe(1);
    expect(r.totalPoints).toBe(1);
    expect(r.days.find((d) => d.dayKey === "2026-10-30")?.points).toBe(1);
  });

  it("an inside sample one interval late stays the same visit", () => {
    const offices = [{ id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 }];
    const late = computeVisits({
      rules: { ...rules, sampleIntervalMinutes: 10 },
      offices,
      events: [
        { type: "enter", at: "2026-10-30T04:00:00.000Z", lat: 22.57, lng: 88.36, accuracyMeters: 5 },
        { type: "sample", at: "2026-10-30T04:22:00.000Z", lat: 22.57, lng: 88.36, accuracyMeters: 5 },
        { type: "exit", at: "2026-10-30T04:30:00.000Z", lat: 22.57, lng: 88.36, accuracyMeters: 5 },
      ],
    });
    expect(late.visits.length).toBe(1);
    expect(late.totalHours).toBeCloseTo(0.5, 3);
    const gone = computeVisits({
      rules: { ...rules, sampleIntervalMinutes: 10 },
      offices,
      events: [
        { type: "enter", at: "2026-10-27T04:00:00.000Z", lat: 22.57, lng: 88.36, accuracyMeters: 5 },
        { type: "sample", at: "2026-10-27T04:10:00.000Z", lat: 22.57, lng: 88.36, accuracyMeters: 5 },
        { type: "sample", at: "2026-10-27T04:40:00.000Z", lat: 22.57, lng: 88.36, accuracyMeters: 5 },
        { type: "exit", at: "2026-10-27T05:00:00.000Z", lat: 22.57, lng: 88.36, accuracyMeters: 5 },
      ],
    });
    expect(gone.visits.length).toBe(2);
    expect(gone.totalHours).toBeCloseTo(0.5, 3);
  });

  it("a should-not-count for the previous local day still scores the next morning", () => {
    const offices = [{ id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 }];
    const start = Date.parse("2026-10-29T00:00:00+05:30");
    const r = computeVisits({
      rules,
      offices,
      exclusions: [{ startAt: new Date(start).toISOString(), endAt: new Date(start + 24 * 60 * 60 * 1000).toISOString() }],
      events: [
        { type: "enter", at: "2026-10-29T22:05:59.566Z", officeLocationId: "kol", accuracyMeters: 3 },
        { type: "exit", at: "2026-10-29T22:06:34.901Z", officeLocationId: "kol", accuracyMeters: 4 },
        { type: "enter", at: "2026-10-29T22:07:20.224Z", officeLocationId: "kol", accuracyMeters: 3 },
        { type: "exit", at: "2026-10-29T22:08:17.713Z", officeLocationId: "kol", accuracyMeters: 4 },
      ],
    });
    expect(r.days.find((d) => d.dayKey === "2026-10-30")?.points).toBe(1);
    expect(r.visits.length).toBe(1);
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

  it("excludes stored visits and preserves only the part outside the excluded day", () => {
    const r = computeVisits({
      rules,
      events: [],
      adminVisits: [
        {
          startAt: "2026-10-27T17:30:00.000Z",
          endAt: "2026-10-28T03:30:00.000Z",
          officeLocationId: "kol",
          pointsPerVisitDay: 1,
        },
      ],
      exclusions: [
        {
          startAt: "2026-10-27T18:30:00.000Z",
          endAt: "2026-10-28T18:30:00.000Z",
        },
      ],
      offices: [{ id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 }],
    });
    expect(r.visits).toHaveLength(1);
    expect(r.visits[0].startAt).toBe("2026-10-27T17:30:00.000Z");
    expect(r.visits[0].endAt).toBe("2026-10-27T18:30:00.000Z");
    expect(r.days.map((day) => day.dayKey)).toEqual(["2026-10-27"]);
  });

  it("a stored correction replaces auto evidence for its whole local day", () => {
    const r = computeVisits({
      rules,
      events: [
        { type: "check_in", at: "2026-10-28T02:30:00.000Z", officeLocationId: "kol" },
        { type: "check_out", at: "2026-10-28T13:30:00.000Z", officeLocationId: "kol" },
      ],
      adminVisits: [
        {
          startAt: "2026-10-28T04:00:00.000Z",
          endAt: "2026-10-28T12:30:00.000Z",
          officeLocationId: "kol",
          pointsPerVisitDay: 1,
        },
      ],
    });
    expect(r.visits).toHaveLength(1);
    expect(r.visits[0].source).toBe("admin");
    expect(r.totalHours).toBeCloseTo(8.5, 5);
  });

  it("keeps a correction visit while its matching exclusion suppresses auto evidence", () => {
    const r = computeVisits({
      rules,
      events: [
        { type: "check_in", at: "2026-10-28T02:30:00.000Z", officeLocationId: "kol" },
        { type: "check_out", at: "2026-10-28T13:30:00.000Z", officeLocationId: "kol" },
      ],
      adminVisits: [
        {
          startAt: "2026-10-28T04:00:00.000Z",
          endAt: "2026-10-28T12:30:00.000Z",
          officeLocationId: "kol",
          pointsPerVisitDay: 1,
          correctionId: "request-1",
        },
      ],
      exclusions: [
        {
          startAt: "2026-10-27T18:30:00.000Z",
          endAt: "2026-10-28T18:30:00.000Z",
          correctionId: "request-1",
        },
      ],
    });
    expect(r.visits).toHaveLength(1);
    expect(r.visits[0].startAt).toBe("2026-10-28T04:00:00.000Z");
    expect(r.totalHours).toBeCloseTo(8.5, 5);
  });

  it("does not count a zero-duration visit inside an exclusion", () => {
    const r = computeVisits({
      rules,
      events: [],
      adminVisits: [
        {
          startAt: "2026-10-27T18:30:00.000Z",
          endAt: "2026-10-27T18:30:00.000Z",
          officeLocationId: "kol",
          pointsPerVisitDay: 1,
        },
      ],
      exclusions: [
        {
          startAt: "2026-10-27T18:30:00.000Z",
          endAt: "2026-10-28T18:30:00.000Z",
        },
      ],
    });
    expect(r.visitDays).toBe(0);
    expect(r.totalPoints).toBe(0);
  });

  it("closes the old day and counts a zero-duration new day at local midnight", () => {
    const events = [
      {
        type: "check_in" as const,
        at: "2026-10-27T17:30:00.000Z",
        officeLocationId: "kol",
      },
      {
        type: "check_out" as const,
        at: "2026-10-27T18:30:00.000Z",
        officeLocationId: "kol",
      },
      {
        type: "check_in" as const,
        at: "2026-10-27T18:30:00.000Z",
        officeLocationId: "kol",
      },
    ];
    const r = computeVisits({ rules, events });
    expect(r.days.map((day) => day.dayKey)).toEqual(["2026-10-27", "2026-10-28"]);
    expect(r.days.map((day) => day.hours)).toEqual([1, 0]);
    expect(r.totalPoints).toBe(2);
  });

  it("extends only the new day's visit after the midnight split", () => {
    const events = [
      {
        type: "check_in" as const,
        at: "2026-10-27T17:30:00.000Z",
        officeLocationId: "kol",
      },
      {
        type: "check_out" as const,
        at: "2026-10-27T18:30:00.000Z",
        officeLocationId: "kol",
      },
      {
        type: "check_in" as const,
        at: "2026-10-27T18:30:00.000Z",
        officeLocationId: "kol",
      },
      {
        type: "sample" as const,
        at: "2026-10-27T18:35:00.000Z",
        officeLocationId: "kol",
      },
    ];
    const r = computeVisits({ rules, events });
    expect(r.days.map((day) => day.dayKey)).toEqual(["2026-10-27", "2026-10-28"]);
    expect(r.days[0].hours).toBeCloseTo(1, 5);
    expect(r.days[1].hours).toBeCloseTo(5 / 60, 5);
  });
});
