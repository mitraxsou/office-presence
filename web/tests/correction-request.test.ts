import { describe, expect, it } from "vitest";
import {
  officeIdsFromQuery,
  officeIdsOnRequest,
  officeLabelForRequestedVisit,
  parseCorrectionRequest,
  pointsForCorrectionOffices,
} from "../src/lib/correction-request";
import { computeVisits, type PresenceRules } from "../src/lib/visit-calculator";

const day = "2026-10-30";
const at = (hm: string) => new Date(`${day}T${hm}:00+05:30`).toISOString();

function ok(result: ReturnType<typeof parseCorrectionRequest>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

describe("Fix today request body", () => {
  it("keeps every visit and each visit's office", () => {
    const r = ok(
      parseCorrectionRequest(
        {
          issue: "wrong_times",
          requested: {
            in_at: at("09:00"),
            out_at: at("11:00"),
            office_id: "egl",
            visits: [
              { office_id: "egl", in_at: at("09:00"), out_at: at("11:00") },
              { office_id: "salt", in_at: at("12:00"), out_at: at("15:30") },
              { office_id: "egl", in_at: at("16:00"), out_at: at("17:00") },
            ],
          },
        },
        day,
      ),
    );
    if (!("visits" in r.requested)) throw new Error("visits dropped");
    expect(r.requested.visits.map((v) => v.office_id)).toEqual(["egl", "salt", "egl"]);
    expect(r.officeIds.sort()).toEqual(["egl", "salt"]);
    expect(r.officeLocationId).toBe("egl");
  });

  it("names each visit from its own office_id, not the request-level first office", () => {
    const byId = new Map([
      ["egl", "My EGL"],
      ["blr", "Fake BLR Office"],
    ]);
    expect(officeLabelForRequestedVisit({ office_id: "blr" }, byId, "My EGL")).toBe("Fake BLR Office");
    expect(officeLabelForRequestedVisit({ office_id: "egl" }, byId, "My EGL")).toBe("My EGL");
    expect(officeLabelForRequestedVisit({ office_id: "missing" }, byId, "My EGL")).toBe("Office");
    expect(officeLabelForRequestedVisit({}, byId, "My EGL")).toBe("My EGL");
  });

  it("uses the visits list when the single pair names a different first visit", () => {
    const r = ok(
      parseCorrectionRequest(
        {
          requested: {
            in_at: at("09:37"),
            out_at: at("09:38"),
            visits: [
              { office_id: "egl", in_at: at("09:37"), out_at: at("09:38") },
              { office_id: "salt", in_at: at("10:00"), out_at: at("12:00") },
            ],
          },
        },
        day,
      ),
    );
    expect("visits" in r.requested && r.requested.visits).toHaveLength(2);
  });

  it("sorts visits sent out of order", () => {
    const r = ok(
      parseCorrectionRequest(
        {
          requested: {
            visits: [
              { office_id: "salt", in_at: at("13:00"), out_at: at("14:00") },
              { office_id: "egl", in_at: at("09:00"), out_at: at("10:00") },
            ],
          },
        },
        day,
      ),
    );
    if (!("visits" in r.requested)) throw new Error("visits dropped");
    expect(r.requested.visits[0].office_id).toBe("egl");
    expect(r.proposedStart.toISOString()).toBe(at("09:00"));
  });

  it("allows Still In only on the last visit", () => {
    const lastOpen = parseCorrectionRequest(
      {
        requested: {
          visits: [
            { office_id: "egl", in_at: at("09:00"), out_at: at("10:00") },
            { office_id: "salt", in_at: at("11:00"), out_at: null },
          ],
        },
      },
      day,
    );
    expect(lastOpen.ok).toBe(true);
    const firstOpen = parseCorrectionRequest(
      {
        requested: {
          visits: [
            { office_id: "egl", in_at: at("09:00"), out_at: null },
            { office_id: "salt", in_at: at("11:00"), out_at: at("12:00") },
          ],
        },
      },
      day,
    );
    expect(firstOpen).toEqual({ ok: false, error: "Only the last visit can be Still In" });
  });

  it("rejects overlapping visits", () => {
    const r = parseCorrectionRequest(
      {
        requested: {
          visits: [
            { office_id: "egl", in_at: at("09:00"), out_at: at("11:00") },
            { office_id: "salt", in_at: at("10:30"), out_at: at("12:00") },
          ],
        },
      },
      day,
    );
    expect(r).toEqual({ ok: false, error: "Visits cannot overlap" });
  });

  it("accepts back to back visits at two offices", () => {
    const r = parseCorrectionRequest(
      {
        requested: {
          visits: [
            { office_id: "egl", in_at: at("09:00"), out_at: at("11:00") },
            { office_id: "salt", in_at: at("11:00"), out_at: at("12:00") },
          ],
        },
      },
      day,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a reversed pair and a blank pair with different messages", () => {
    const reversed = parseCorrectionRequest(
      { requested: { visits: [{ office_id: "egl", in_at: at("11:00"), out_at: at("09:00") }] } },
      day,
    );
    expect(reversed).toEqual({ ok: false, error: "Out must be after In" });
    const equal = parseCorrectionRequest(
      { requested: { visits: [{ office_id: "egl", in_at: at("11:00"), out_at: at("11:00") }] } },
      day,
    );
    expect(equal).toEqual({ ok: false, error: "Out must be after In" });
    const blank = parseCorrectionRequest({ requested: { visits: [{ office_id: "egl", in_at: "" }] } }, day);
    expect(blank).toEqual({ ok: false, error: "Valid in_at and out_at required" });
  });

  it("treats a blank or unknown office as no office", () => {
    const r = ok(
      parseCorrectionRequest(
        {
          requested: {
            visits: [
              { office_id: "", in_at: at("09:00"), out_at: at("10:00") },
              { office_id: "unknown", in_at: at("11:00"), out_at: at("12:00") },
            ],
          },
        },
        day,
      ),
    );
    expect(r.officeIds).toEqual([]);
  });

  it("still reads the older single pair", () => {
    const r = ok(
      parseCorrectionRequest(
        { requested: { office_id: "egl", in_at: at("09:00"), out_at: at("17:00") } },
        day,
      ),
    );
    expect(r.requested).toEqual({ office_id: "egl", in_at: at("09:00"), out_at: at("17:00") });
  });

  it("reads proposedStart and proposedEnd when requested is missing", () => {
    const r = ok(
      parseCorrectionRequest(
        { proposedStart: at("09:00"), proposedEnd: at("10:00"), officeLocationId: "salt" },
        day,
      ),
    );
    expect(r.officeLocationId).toBe("salt");
  });

  it("turns an empty Fix today into should not count", () => {
    const r = ok(parseCorrectionRequest({ issue: "should_not_count", requested: { remove: true } }, day));
    expect(r.requested).toEqual({ remove: true });
    expect(ok(parseCorrectionRequest({ requested: { remove: true } }, day)).requested).toEqual({ remove: true });
  });
});

describe("office weight on a correction", () => {
  it("counts the highest office, and no office as 0", () => {
    expect(pointsForCorrectionOffices([])).toBe(0);
    expect(pointsForCorrectionOffices([0])).toBe(0);
    expect(pointsForCorrectionOffices([1])).toBe(1);
    expect(pointsForCorrectionOffices([2])).toBe(2);
    expect(pointsForCorrectionOffices([1, 2])).toBe(2);
    expect(pointsForCorrectionOffices([2, 1, 2])).toBe(2);
    expect(pointsForCorrectionOffices([0, 1])).toBe(1);
  });

  it("keeps every office on a visits list and one office on a wrong office request", () => {
    expect(
      officeIdsOnRequest({
        visits: [
          { office_id: "egl" },
          { office_id: "salt" },
          { office_id: "egl" },
          { office_id: "" },
          { office_id: "unknown" },
        ],
      }),
    ).toEqual(["egl", "salt"]);
    expect(officeIdsOnRequest({ office_id: "salt" })).toEqual(["salt"]);
    expect(officeIdsOnRequest({ office_id: "null" })).toEqual([]);
    expect(officeIdsOnRequest({ remove: true, office_id: "egl" })).toEqual([]);
  });

  it("reads the preview office list and falls back to one office", () => {
    expect(officeIdsFromQuery("egl,salt,egl", "other")).toEqual(["egl", "salt"]);
    expect(officeIdsFromQuery("egl,unknown,salt", null)).toEqual(["egl", "salt"]);
    expect(officeIdsFromQuery(" ,unknown,null", "salt")).toEqual(["salt"]);
    expect(officeIdsFromQuery(null, "salt")).toEqual(["salt"]);
    expect(officeIdsFromQuery("", "unknown")).toEqual([]);
    expect(officeIdsFromQuery(null, null)).toEqual([]);
  });
});

describe("a saved multi office Fix today", () => {
  const rules: PresenceRules = {
    gapMinutes: 15,
    dayHours: 5,
    monthlyDaysTarget: 8,
    monthlyPointsTarget: 8,
    timezone: "Asia/Kolkata",
    fenceRadiusMeters: 100,
  };
  const offices = [
    { id: "egl", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 },
    { id: "salt", lat: 22.58, lng: 88.43, radiusMeters: 100, pointsPerVisitDay: 2 },
  ];
  const dayStart = new Date(`${day}T00:00:00+05:30`).toISOString();
  const dayEnd = new Date(`${day}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000;

  it("keeps both offices, hides GPS fragments, and awards the higher office points", () => {
    const r = computeVisits({
      rules,
      offices,
      pointOffices: offices,
      events: [
        { type: "enter", at: at("09:37"), officeLocationId: "egl", accuracyMeters: 3 },
        { type: "exit", at: at("09:38"), officeLocationId: "egl", accuracyMeters: 3 },
      ],
      adminVisits: [
        { startAt: at("09:00"), endAt: at("11:00"), officeLocationId: "egl", pointsPerVisitDay: 1, correctionId: "c1" },
        { startAt: at("12:00"), endAt: at("15:30"), officeLocationId: "salt", pointsPerVisitDay: 2, correctionId: "c1" },
      ],
      exclusions: [{ startAt: dayStart, endAt: new Date(dayEnd).toISOString(), correctionId: "c1" }],
    });
    expect(r.visits.map((v) => v.officeLocationId)).toEqual(["egl", "salt"]);
    expect(r.days).toHaveLength(1);
    expect(r.days[0].points).toBe(2);
    expect(r.totalHours).toBeCloseTo(5.5, 5);
  });
});
