import { dayKeyInTz, localDayBounds } from "./visit-calculator";
import { isPwcEmail } from "./email";

/** Reason stored on each imported visit. The day key suffix makes reruns skip that day. */
export const OFFICE_TRACKER_REASON_PREFIX = "office-tracker-backfill:";

export const OFFICE_TRACKER_HEADERS = [
  "email",
  "name",
  "preferredName",
  "timezone",
  "role",
  "dayKey",
  "firstIn",
  "lastOut",
  "hours",
] as const;

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ImportIssue = { line: number; email: string; reason: string };

export type CsvRow = {
  line: number;
  email: string;
  name: string;
  preferredName: string;
  timezone: string;
  role: "admin" | "user";
  dayKey: string | null;
  firstIn: Date | null;
  lastOut: Date | null;
  hours: number | null;
};

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF, optional BOM. */
export function parseCsvText(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function validTimezone(raw: string): string {
  const tz = raw.trim();
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function clean(raw: string | undefined, max: number): string {
  return (raw ?? "").trim().slice(0, max);
}

function parseInstant(raw: string | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * Parse the Office Tracker export. Every problem becomes an issue with a line number;
 * valid rows are returned even when others fail.
 */
export function parseOfficeTrackerCsv(text: string): {
  rows: CsvRow[];
  issues: ImportIssue[];
  headerError: string | null;
} {
  const table = parseCsvText(text);
  if (table.length === 0) return { rows: [], issues: [], headerError: "CSV is empty" };

  const header = table[0].map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h, i]));
  const missing = OFFICE_TRACKER_HEADERS.filter((h) => !index.has(h));
  if (missing.length > 0) {
    return { rows: [], issues: [], headerError: `Missing columns: ${missing.join(", ")}` };
  }

  const get = (cells: string[], key: (typeof OFFICE_TRACKER_HEADERS)[number]) =>
    cells[index.get(key)!] ?? "";

  const rows: CsvRow[] = [];
  const issues: ImportIssue[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const line = r + 1;
    const email = get(cells, "email").trim().toLowerCase();

    if (!email) {
      issues.push({ line, email: "", reason: "Missing email" });
      continue;
    }
    if (!isPwcEmail(email)) {
      issues.push({ line, email, reason: "Email must end with @pwc.com" });
      continue;
    }

    const dayKeyRaw = get(cells, "dayKey").trim();
    const base = {
      line,
      email,
      name: clean(get(cells, "name"), 120),
      preferredName: clean(get(cells, "preferredName"), 30),
      timezone: validTimezone(get(cells, "timezone")),
      role: (get(cells, "role").trim().toLowerCase() === "admin" ? "admin" : "user") as
        | "admin"
        | "user",
    };

    // User-only row (no office days): keeps the user in the import.
    if (!dayKeyRaw) {
      rows.push({ ...base, dayKey: null, firstIn: null, lastOut: null, hours: null });
      continue;
    }

    if (!DAY_KEY_RE.test(dayKeyRaw)) {
      issues.push({ line, email, reason: `Invalid dayKey "${dayKeyRaw}"` });
      continue;
    }
    const firstIn = parseInstant(get(cells, "firstIn"));
    const lastOut = parseInstant(get(cells, "lastOut"));
    if (!firstIn || !lastOut) {
      issues.push({ line, email, reason: "firstIn and lastOut are required for a day" });
      continue;
    }
    if (lastOut.getTime() <= firstIn.getTime()) {
      issues.push({ line, email, reason: "lastOut must be after firstIn" });
      continue;
    }
    const hours = Number(get(cells, "hours"));
    rows.push({
      ...base,
      dayKey: dayKeyRaw,
      firstIn,
      lastOut,
      hours: Number.isFinite(hours) ? hours : (lastOut.getTime() - firstIn.getTime()) / 3_600_000,
    });
  }

  return { rows, issues, headerError: null };
}

export type ExistingUser = {
  id: string;
  email: string;
  role: string;
  timezone: string;
  homeOfficeId: string | null;
  deactivated: boolean;
};

export type ExistingVisit = {
  startAt: Date;
  endAt: Date | null;
  reason: string | null;
};

export type PlannedUser = {
  email: string;
  name: string;
  preferredName: string;
  timezone: string;
  role: "admin" | "user";
};

export type PlannedDay = {
  email: string;
  dayKey: string;
  startAt: Date;
  endAt: Date;
  hours: number;
  /** Home office when set, otherwise the fallback office (EGL). */
  officeLocationId: string;
};

export type ImportPlanInput = {
  rows: CsvRow[];
  existingUsers: ExistingUser[];
  visitsByUserId: Map<string, ExistingVisit[]>;
  /** Active office id used when the person has no home office (EGL). */
  fallbackOfficeId: string;
  now: Date;
};

export type ImportPlan = {
  usersToCreate: PlannedUser[];
  usersToAttachHomeOffice: string[];
  daysToInsert: PlannedDay[];
  skippedUsers: Array<{ email: string; reason: string }>;
  issues: ImportIssue[];
  counts: {
    csvUsers: number;
    usersToCreate: number;
    usersMatched: number;
    usersSkipped: number;
    daysToInsert: number;
    daysSkippedAlreadyImported: number;
    daysSkippedHasVisit: number;
    daysSkippedTodayOrLater: number;
    daysDuplicateInCsv: number;
  };
};

function overlapsDay(v: ExistingVisit, startMs: number, endMs: number): boolean {
  if (v.startAt.getTime() >= endMs) return false;
  if (v.endAt === null) return true;
  return v.endAt.getTime() > startMs;
}

/**
 * Pure plan: decides what would be created without touching the database.
 * Rules: match users by lowercased email; never change an existing user's role, name,
 * or password; add days only where this app has no visit (phone data wins); a day
 * already imported (same reason) is skipped; today and later are skipped.
 */
export function planOfficeTrackerImport(input: ImportPlanInput): ImportPlan {
  const { rows, existingUsers, visitsByUserId, fallbackOfficeId, now } = input;
  const usersByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));

  const issues: ImportIssue[] = [];
  const skippedUsers: Array<{ email: string; reason: string }> = [];
  const usersToCreate: PlannedUser[] = [];
  const usersToAttachHomeOffice: string[] = [];
  const daysToInsert: PlannedDay[] = [];
  const counts = {
    csvUsers: 0,
    usersToCreate: 0,
    usersMatched: 0,
    usersSkipped: 0,
    daysToInsert: 0,
    daysSkippedAlreadyImported: 0,
    daysSkippedHasVisit: 0,
    daysSkippedTodayOrLater: 0,
    daysDuplicateInCsv: 0,
  };

  // Group rows by email; the first row's profile fields win.
  const byEmail = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const list = byEmail.get(row.email) ?? [];
    list.push(row);
    byEmail.set(row.email, list);
  }
  counts.csvUsers = byEmail.size;

  for (const [email, userRows] of byEmail) {
    const profile = userRows[0];
    const existing = usersByEmail.get(email);

    if (existing?.deactivated) {
      skippedUsers.push({ email, reason: "Account is deactivated in Office Presence" });
      continue;
    }

    const userId = existing?.id ?? null;
    const timezone = existing?.timezone ?? profile.timezone;
    const officeLocationId = existing?.homeOfficeId ?? fallbackOfficeId;

    if (existing) {
      counts.usersMatched += 1;
      if (!existing.homeOfficeId) usersToAttachHomeOffice.push(existing.id);
    } else {
      usersToCreate.push({
        email,
        name: profile.name,
        preferredName: profile.preferredName,
        timezone: profile.timezone,
        role: profile.role,
      });
      counts.usersToCreate += 1;
    }

    const seenDays = new Set<string>();
    for (const row of userRows) {
      if (!row.dayKey || !row.firstIn || !row.lastOut) continue;
      const dayKey = row.dayKey;

      if (seenDays.has(dayKey)) {
        counts.daysDuplicateInCsv += 1;
        issues.push({ line: row.line, email, reason: `Duplicate day ${dayKey} in CSV` });
        continue;
      }
      seenDays.add(dayKey);

      if (dayKeyInTz(now, timezone) <= dayKey) {
        counts.daysSkippedTodayOrLater += 1;
        continue;
      }

      const { startMs, endMs } = localDayBounds(dayKey, timezone);
      const visits = userId ? (visitsByUserId.get(userId) ?? []) : [];
      const reason = `${OFFICE_TRACKER_REASON_PREFIX}${dayKey}`;

      if (visits.some((v) => v.reason === reason)) {
        counts.daysSkippedAlreadyImported += 1;
        continue;
      }
      if (visits.some((v) => overlapsDay(v, startMs, endMs))) {
        counts.daysSkippedHasVisit += 1;
        continue;
      }

      daysToInsert.push({
        email,
        dayKey,
        startAt: row.firstIn,
        endAt: row.lastOut,
        hours: row.hours ?? 0,
        officeLocationId,
      });
      counts.daysToInsert += 1;
    }
  }

  counts.usersSkipped = skippedUsers.length;

  return {
    usersToCreate,
    usersToAttachHomeOffice,
    daysToInsert,
    skippedUsers,
    issues,
    counts,
  };
}
