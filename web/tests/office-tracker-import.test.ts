import { describe, expect, it } from "vitest";
import {
  OFFICE_TRACKER_REASON_PREFIX,
  parseCsvText,
  parseOfficeTrackerCsv,
  planOfficeTrackerImport,
  type CsvRow,
  type ExistingUser,
  type ExistingVisit,
} from "../src/lib/office-tracker-import";

const NOW = new Date("2026-10-29T06:00:00Z"); // 11:30 IST on Oct 29

const HEADER = "email,name,preferredName,timezone,role,dayKey,firstIn,lastOut,hours";

function csv(...lines: string[]) {
  return [HEADER, ...lines].join("\r\n");
}

describe("parseCsvText", () => {
  it("handles BOM, CRLF, quoted commas and escaped quotes", () => {
    const table = parseCsvText('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n');
    expect(table).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
});

describe("parseOfficeTrackerCsv", () => {
  it("reports a missing column as a header error", () => {
    const parsed = parseOfficeTrackerCsv("email,name\r\na@pwc.com,A");
    expect(parsed.headerError).toMatch(/Missing columns/);
  });

  it("keeps user-only rows and valid day rows, and reports bad rows with line numbers", () => {
    const text = csv(
      "ada@pwc.com,Ada,Ada,Asia/Kolkata,admin,,,,",
      "ada@pwc.com,Ada,Ada,Asia/Kolkata,admin,2026-10-20,2026-10-20T03:30:00Z,2026-10-20T10:00:00Z,6.5",
      "bob@example.com,Bob,,Asia/Kolkata,user,2026-10-20,2026-10-20T03:30:00Z,2026-10-20T10:00:00Z,6.5",
      "bob@pwc.com,Bob,,Asia/Kolkata,user,2026-10-20,,2026-10-20T10:00:00Z,6.5",
      "bob@pwc.com,Bob,,Asia/Kolkata,user,2026-10-21,2026-10-21T10:00:00Z,2026-10-21T03:00:00Z,-7",
      "bob@pwc.com,Bob,,Asia/Kolkata,user,not-a-day,2026-10-21T03:00:00Z,2026-10-21T10:00:00Z,7",
    );
    const parsed = parseOfficeTrackerCsv(text);
    expect(parsed.headerError).toBeNull();
    expect(parsed.rows.map((r) => [r.email, r.dayKey])).toEqual([
      ["ada@pwc.com", null],
      ["ada@pwc.com", "2026-10-20"],
    ]);
    expect(parsed.issues.map((i) => i.line)).toEqual([4, 5, 6, 7]);
    expect(parsed.issues[0].reason).toMatch(/pwc\.com/);
  });

  it("maps any non-admin role to user and falls back to Asia/Kolkata for a bad timezone", () => {
    const parsed = parseOfficeTrackerCsv(csv("c@pwc.com,C,,Mars/Olympus,owner,,,,"));
    expect(parsed.rows[0].role).toBe("user");
    expect(parsed.rows[0].timezone).toBe("Asia/Kolkata");
  });
});

function dayRow(email: string, dayKey: string, line = 2): CsvRow {
  return {
    line,
    email,
    name: "Person",
    preferredName: "",
    timezone: "Asia/Kolkata",
    role: "user",
    dayKey,
    firstIn: new Date(`${dayKey}T03:30:00Z`),
    lastOut: new Date(`${dayKey}T10:00:00Z`),
    hours: 6.5,
  };
}

const FALLBACK_OFFICE = "egl-office";

function plan(input: Omit<Parameters<typeof planOfficeTrackerImport>[0], "fallbackOfficeId"> & {
  fallbackOfficeId?: string;
}) {
  return planOfficeTrackerImport({
    fallbackOfficeId: FALLBACK_OFFICE,
    ...input,
  });
}

describe("planOfficeTrackerImport", () => {
  it("creates a missing user and inserts every day, including short ones", () => {
    const rows: CsvRow[] = [
      dayRow("new.person@pwc.com", "2026-10-20"),
      { ...dayRow("new.person@pwc.com", "2026-10-21"), hours: 0.4, lastOut: new Date("2026-10-21T04:00:00Z") },
    ];
    const result = plan({ rows, existingUsers: [], visitsByUserId: new Map(), now: NOW });
    expect(result.usersToCreate.map((u) => u.email)).toEqual(["new.person@pwc.com"]);
    expect(result.daysToInsert.map((d) => d.dayKey)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(result.counts.daysToInsert).toBe(2);
    expect(result.daysToInsert.every((d) => d.officeLocationId === FALLBACK_OFFICE)).toBe(true);
  });

  it("never inserts today or a later day", () => {
    const rows = [dayRow("a@pwc.com", "2026-10-29"), dayRow("a@pwc.com", "2026-10-30")];
    const result = plan({ rows, existingUsers: [], visitsByUserId: new Map(), now: NOW });
    expect(result.daysToInsert).toHaveLength(0);
    expect(result.counts.daysSkippedTodayOrLater).toBe(2);
  });

  it("adds only days the app does not already have a visit for (phone data wins)", () => {
    const user: ExistingUser = {
      id: "u1",
      email: "phone.user@pwc.com",
      role: "user",
      timezone: "Asia/Kolkata",
      homeOfficeId: "office-1",
      deactivated: false,
    };
    const visits: ExistingVisit[] = [
      {
        startAt: new Date("2026-10-20T04:00:00Z"),
        endAt: new Date("2026-10-20T05:00:00Z"),
        reason: null,
      },
    ];
    const rows = [dayRow("phone.user@pwc.com", "2026-10-20"), dayRow("phone.user@pwc.com", "2026-10-22")];
    const result = plan({
      rows,
      existingUsers: [user],
      visitsByUserId: new Map([["u1", visits]]),
      now: NOW,
    });
    expect(result.daysToInsert.map((d) => d.dayKey)).toEqual(["2026-10-22"]);
    expect(result.counts.daysSkippedHasVisit).toBe(1);
    expect(result.usersToCreate).toHaveLength(0);
    expect(result.counts.usersMatched).toBe(1);
  });

  it("uses the person's home office for days, or the fallback when they have none", () => {
    const base = { role: "user", timezone: "Asia/Kolkata", deactivated: false };
    const users: ExistingUser[] = [
      { id: "has", email: "has@pwc.com", homeOfficeId: "home-office-x", ...base },
      { id: "none", email: "none@pwc.com", homeOfficeId: null, ...base },
    ];
    const result = plan({
      rows: [dayRow("has@pwc.com", "2026-10-20"), dayRow("none@pwc.com", "2026-10-20")],
      existingUsers: users,
      visitsByUserId: new Map(),
      now: NOW,
    });
    expect(result.usersToAttachHomeOffice).toEqual(["none"]);
    expect(result.daysToInsert).toEqual([
      expect.objectContaining({ email: "has@pwc.com", officeLocationId: "home-office-x" }),
      expect.objectContaining({ email: "none@pwc.com", officeLocationId: FALLBACK_OFFICE }),
    ]);
  });

  it("sets home office only when the existing user has none, and never returns role changes", () => {
    const base = { role: "user", timezone: "Asia/Kolkata", deactivated: false };
    const users: ExistingUser[] = [
      { id: "has", email: "has@pwc.com", homeOfficeId: "office-x", ...base },
      { id: "none", email: "none@pwc.com", homeOfficeId: null, ...base },
    ];
    const result = plan({
      rows: [dayRow("has@pwc.com", "2026-10-20"), dayRow("none@pwc.com", "2026-10-20")],
      existingUsers: users,
      visitsByUserId: new Map(),
      now: NOW,
    });
    expect(result.usersToAttachHomeOffice).toEqual(["none"]);
  });

  it("skips deactivated accounts and reports them", () => {
    const result = plan({
      rows: [dayRow("gone@pwc.com", "2026-10-20")],
      existingUsers: [
        { id: "g", email: "gone@pwc.com", role: "user", timezone: "Asia/Kolkata", homeOfficeId: null, deactivated: true },
      ],
      visitsByUserId: new Map(),
      now: NOW,
    });
    expect(result.daysToInsert).toHaveLength(0);
    expect(result.skippedUsers).toEqual([
      { email: "gone@pwc.com", reason: "Account is deactivated in Office Presence" },
    ]);
  });

  it("flags a duplicate day inside the CSV and keeps the first row", () => {
    const result = plan({
      rows: [dayRow("d@pwc.com", "2026-10-20", 2), dayRow("d@pwc.com", "2026-10-20", 3)],
      existingUsers: [],
      visitsByUserId: new Map(),
      now: NOW,
    });
    expect(result.daysToInsert).toHaveLength(1);
    expect(result.issues).toEqual([{ line: 3, email: "d@pwc.com", reason: "Duplicate day 2026-10-20 in CSV" }]);
  });

  it("is idempotent: a second run over imported days inserts nothing", () => {
    const rows = [dayRow("again@pwc.com", "2026-10-20"), dayRow("again@pwc.com", "2026-10-21")];
    const first = plan({ rows, existingUsers: [], visitsByUserId: new Map(), now: NOW });
    expect(first.daysToInsert).toHaveLength(2);

    // Simulate the apply step: the new user gets an id and one tagged visit per planned day.
    const userId = "new-user";
    const visits: ExistingVisit[] = first.daysToInsert.map((d) => ({
      startAt: d.startAt,
      endAt: d.endAt,
      reason: `${OFFICE_TRACKER_REASON_PREFIX}${d.dayKey}`,
    }));
    const second = plan({
      rows,
      existingUsers: [
        { id: userId, email: "again@pwc.com", role: "user", timezone: "Asia/Kolkata", homeOfficeId: "o", deactivated: false },
      ],
      visitsByUserId: new Map([[userId, visits]]),
      now: NOW,
    });
    expect(second.daysToInsert).toHaveLength(0);
    expect(second.counts.daysSkippedAlreadyImported).toBe(2);
  });
});
