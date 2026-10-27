import { describe, expect, it } from "vitest";
import {
  applyRosterFilters,
  computeRosterStats,
  isNoRecentSync,
  type RosterUserRow,
} from "../src/lib/roster";
import { CSV_CONTENT_TYPE, csvEscape, toCsv } from "../src/lib/export-csv";
import { phoneSyncPerDevice } from "../src/lib/phone-sync";

function row(partial: Partial<RosterUserRow> & Pick<RosterUserRow, "id" | "email">): RosterUserRow {
  return {
    name: null,
    role: "user",
    inOffice: false,
    sinceAt: null,
    officeName: null,
    officeLocationId: null,
    hoursToday: 0,
    monthPoints: 0,
    monthVisitDays: 0,
    monthDays: 0,
    lastDeviceName: null,
    devices: 0,
    devicesOnline: 0,
    lastEvidenceAt: null,
    noRecentSync: false,
    ...partial,
  };
}

describe("roster filter stats helpers", () => {
  it("computes in/out/below/goal stats", () => {
    const users = [
      row({ id: "1", email: "a@pwc.com", inOffice: true, monthPoints: 8 }),
      row({ id: "2", email: "b@pwc.com", inOffice: false, monthPoints: 3 }),
      row({ id: "3", email: "c@pwc.com", inOffice: false, monthPoints: 8 }),
    ];
    expect(computeRosterStats(users, 8)).toEqual({
      inNow: 1,
      out: 2,
      belowTarget: 1,
      goalMet: 2,
    });
  });

  it("filters by q, office, status, belowTarget", () => {
    const users = [
      row({
        id: "1",
        email: "arjun@pwc.com",
        name: "Arjun",
        inOffice: true,
        officeName: "Gurugram",
        officeLocationId: "o1",
        monthPoints: 2,
      }),
      row({
        id: "2",
        email: "meera@pwc.com",
        name: "Meera",
        inOffice: false,
        officeName: "Kolkata",
        officeLocationId: "o2",
        monthPoints: 9,
      }),
    ];
    expect(applyRosterFilters(users, { q: "arj" }, 8).map((u) => u.id)).toEqual(["1"]);
    expect(applyRosterFilters(users, { office: "o2" }, 8).map((u) => u.id)).toEqual(["2"]);
    expect(applyRosterFilters(users, { office: "guru" }, 8).map((u) => u.id)).toEqual(["1"]);
    expect(applyRosterFilters(users, { status: "in" }, 8).map((u) => u.id)).toEqual(["1"]);
    expect(applyRosterFilters(users, { belowTarget: true }, 8).map((u) => u.id)).toEqual(["1"]);
  });

  it("flags noRecentSync when both device and evidence are stale", () => {
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    const day = 24 * 60 * 60 * 1000;
    expect(isNoRecentSync([new Date(now - day - 1000)], new Date(now - day - 1000), now)).toBe(true);
    expect(isNoRecentSync([new Date(now - 1000)], new Date(now - day - 1000), now)).toBe(false);
    expect(isNoRecentSync([new Date(now - day - 1000)], new Date(now - 1000), now)).toBe(false);
    expect(isNoRecentSync([], null, now)).toBe(true);
  });
});

describe("export CSV helpers", () => {
  it("uses text/csv content type constant", () => {
    expect(CSV_CONTENT_TYPE).toBe("text/csv; charset=utf-8");
  });

  it("escapes commas and quotes", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(toCsv(["email", "name"], [["a@pwc.com", "Ada"]])).toContain("email,name");
    expect(toCsv(["email", "name"], [["a@pwc.com", "Ada"]])).toContain("a@pwc.com,Ada");
  });
});

describe("phoneSync per device", () => {
  it("picks last before In and first after Out", () => {
    const inAt = new Date("2026-10-15T04:00:00.000Z");
    const outAt = new Date("2026-10-15T12:00:00.000Z");
    const rows = phoneSyncPerDevice(
      [
        { deviceName: "Pixel 8", recordedAt: new Date("2026-10-15T03:30:00.000Z") },
        { deviceName: "Pixel 8", recordedAt: new Date("2026-10-15T03:55:00.000Z") },
        { deviceName: "Pixel 8", recordedAt: new Date("2026-10-15T12:05:00.000Z") },
        { deviceName: "Galaxy", recordedAt: new Date("2026-10-15T08:00:00.000Z") },
      ],
      inAt,
      outAt,
    );
    expect(rows).toEqual([
      {
        device: "Galaxy",
        lastBeforeIn: null,
        firstAfterOut: null,
      },
      {
        device: "Pixel 8",
        lastBeforeIn: "2026-10-15T03:55:00.000Z",
        firstAfterOut: "2026-10-15T12:05:00.000Z",
      },
    ]);
  });
});
