import { adminVisitPoints } from "./points-format";

export type PresenceRules = {
  gapMinutes: number;
  dayHours: number;
  monthlyDaysTarget: number;
  monthlyPointsTarget?: number;
  timezone: string;
  fenceRadiusMeters: number;
  sampleIntervalMinutes?: number;
  gapSeconds?: number;
  correctionWindowDays?: number;
  correctionRequiresApproval?: boolean;
  correctionAutoApproveLimit?: number;
  correctionRequireSync?: boolean;
  correctionDailyDigest?: boolean;
  appVersionCode?: number;
  appVersionName?: string;
  appApkUrl?: string | null;
  /** Ingest only: store mock GPS from real accounts untrusted. */
  rejectMockLocations?: boolean;
  /** Privacy: days before event coordinates are cleared, notice version, consent gate on ingest. */
  rawLocationRetentionDays?: number;
  privacyNoticeVersion?: string;
  requireConsent?: boolean;
  /** Leave and HR exceptions (records and grants). */
  allowSelfLeave?: boolean;
  allowExceptionsInClosedMonths?: boolean;
  /** Managers may decide corrections for people in their scope. */
  managersDecideCorrections?: boolean;
};

export type PresenceEventInput = {
  type: "enter" | "sample" | "exit" | "check_in" | "check_out";
  at: string;
  lat?: number | null;
  lng?: number | null;
  accuracyMeters?: number | null;
  simulated?: boolean;
  officeLocationId?: string | null;
  pointsPerVisitDay?: number | null;
  /** Office points stored when the event was matched (PresenceEvent.pointsAtMatch). */
  pointsAtMatch?: number | null;
};

export type AdminVisitInput = {
  startAt: string;
  endAt: string;
  source?: "admin" | "manual";
  officeLocationId?: string | null;
  pointsPerVisitDay?: number | null;
  correctionId?: string | null;
};

export type ExclusionInput = {
  startAt: string;
  endAt: string;
  correctionId?: string | null;
  /** Full-day exclusion from an admin edit. It suppresses phone evidence, not the admin visit. */
  adminDayEdit?: boolean;
};

/** Flags stored on a visit exclusion row. Admin day edits must not erase the admin visit. */
export function exclusionFlags(reason: string | null | undefined): {
  correctionId: string | null;
  adminDayEdit: boolean;
} {
  return {
    correctionId: reason ? /^Correction ([^:]+):/.exec(reason)?.[1] ?? null : null,
    adminDayEdit: Boolean(reason?.startsWith("Admin day edit:")),
  };
}

/** A stored HR exception day (PresenceExceptionDay of a grant that is not revoked). */
export type ExceptionDayInput = {
  dayKey: string;
  points: number;
  exceptionId: string;
  officeLocationId?: string | null;
};

export type OfficeFenceInput = {
  id?: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  pointsPerVisitDay?: number;
};

export type ComputedVisit = {
  startAt: string;
  endAt: string;
  source: "auto" | "manual" | "admin";
  hours: number;
  officeLocationId?: string | null;
  pointsAwarded?: number;
  correctionId?: string | null;
  /** Still inside, with the end set to the clock used for this compute. */
  open?: boolean;
};

export type DayPointsResult = {
  dayKey: string;
  visited: boolean;
  points: number;
  hours: number;
  firstIn: string | null;
  lastOut: string | null;
  officeLocationId: string | null;
  /** HR exception that covers this day (highest points when several do). */
  exception?: { id: string; points: number } | null;
};

export type ComputeResult = {
  visits: ComputedVisit[];
  totalHours: number;
  /** Advisory only: total hours reached the dayHours figure. Never gates points. */
  dayMet: boolean;
  dayKeysVisited: string[];
  visitDays: number;
  totalPoints: number;
  /** Points target met: totalPoints >= monthlyPointsTarget. */
  targetMet: boolean;
  days: DayPointsResult[];
};

function toMs(iso: string): number {
  return Date.parse(iso);
}

function hoursBetween(startMs: number, endMs: number): number {
  return Math.max(0, (endMs - startMs) / 3_600_000);
}

type MsRange = { start: number; end: number };

/** A correction's own visit, and an admin edit's visit, stay inside a matching exclusion. */
function exclusionAppliesToVisit(visit: ComputedVisit, exclusion: ExclusionInput): boolean {
  if (visit.correctionId && exclusion.correctionId === visit.correctionId) return false;
  if (visit.source === "admin" && exclusion.adminDayEdit) return false;
  return true;
}

function subtractRange(parts: MsRange[], cut: MsRange): MsRange[] {
  const next: MsRange[] = [];
  for (const part of parts) {
    if (part.end <= cut.start || part.start >= cut.end) {
      next.push(part);
      continue;
    }
    if (part.start < cut.start) next.push({ start: part.start, end: Math.min(part.end, cut.start) });
    if (part.end > cut.end) next.push({ start: Math.max(part.start, cut.end), end: part.end });
  }
  return next.filter((part) => part.end > part.start);
}

/** Hours in the union of ranges. Overlap counts once. */
export function unionHours(parts: MsRange[]): number {
  const sorted = parts
    .filter((part) => part.end > part.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let totalMs = 0;
  let cur: MsRange | null = null;
  for (const part of sorted) {
    if (!cur || part.start > cur.end) {
      if (cur) totalMs += cur.end - cur.start;
      cur = { start: part.start, end: part.end };
    } else if (part.end > cur.end) {
      cur.end = part.end;
    }
  }
  if (cur) totalMs += cur.end - cur.start;
  return totalMs / 3_600_000;
}

/**
 * One office on one day: first In to last Out, with should-not-count periods removed.
 * A protected visit (the correction itself) is put back if a wider exclusion was cut out.
 */
function officeSpanParts(visits: ComputedVisit[], exclusions: ExclusionInput[]): MsRange[] {
  if (!visits.length) return [];
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const visit of visits) {
    const start = toMs(visit.startAt);
    const end = toMs(visit.endAt);
    if (start < first) first = start;
    if (end > last) last = end;
  }
  if (!Number.isFinite(first) || !(last > first)) return [];
  let parts: MsRange[] = [{ start: first, end: last }];
  for (const exclusion of exclusions) {
    const cut = { start: toMs(exclusion.startAt), end: toMs(exclusion.endAt) };
    if (!(cut.end > cut.start)) continue;
    if (!visits.some((visit) => exclusionAppliesToVisit(visit, exclusion))) continue;
    const protectedParts: MsRange[] = [];
    for (const visit of visits) {
      if (exclusionAppliesToVisit(visit, exclusion)) continue;
      const start = toMs(visit.startAt);
      const end = toMs(visit.endAt);
      if (end > start) protectedParts.push({ start, end });
    }
    parts = subtractRange(parts, cut).concat(protectedParts);
  }
  return parts;
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function dayKeyInTz(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Start of local calendar day as UTC instant approximation via en-CA parts + offset guess for Asia/Kolkata. */
export function localDayBounds(dayKey: string, timezone: string): { startMs: number; endMs: number } {
  // For Asia/Kolkata and similar fixed offsets, interpret dayKey as local midnight.
  // Use Temporal-free approach: construct with offset for known default, else noon UTC scan.
  if (timezone === "Asia/Kolkata" || timezone === "Asia/Calcutta") {
    const startMs = Date.parse(`${dayKey}T00:00:00+05:30`);
    return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
  }
  // Fallback: find UTC instant where local dayKey starts by probing
  let startMs = Date.parse(`${dayKey}T00:00:00Z`);
  for (let i = -14; i <= 14; i++) {
    const candidate = startMs + i * 3600_000;
    if (dayKeyInTz(new Date(candidate), timezone) === dayKey) {
      const prev = candidate - 60_000;
      if (dayKeyInTz(new Date(prev), timezone) !== dayKey) {
        startMs = candidate;
        break;
      }
    }
  }
  // refine to minute
  while (dayKeyInTz(new Date(startMs - 60_000), timezone) === dayKey) startMs -= 60_000;
  while (dayKeyInTz(new Date(startMs), timezone) !== dayKey) startMs += 60_000;
  const endMs = startMs + 36 * 3600_000;
  let realEnd = startMs + 24 * 3600_000;
  while (dayKeyInTz(new Date(realEnd - 1), timezone) === dayKey && realEnd < endMs) realEnd += 60_000;
  while (dayKeyInTz(new Date(realEnd - 1), timezone) !== dayKey && realEnd > startMs) realEnd -= 60_000;
  return { startMs, endMs: realEnd };
}

function isInsideOffice(
  event: PresenceEventInput,
  office: OfficeFenceInput | null,
  rules: PresenceRules,
): boolean {
  if (event.type === "check_in") return true;
  if (event.type === "check_out" || event.type === "exit") return false;
  if (!office || event.lat == null || event.lng == null) return false;
  const accuracy = event.accuracyMeters ?? Number.POSITIVE_INFINITY;
  if (accuracy > rules.fenceRadiusMeters) return false;
  const distance = haversineMeters(event.lat, event.lng, office.lat, office.lng);
  return distance <= office.radiusMeters;
}

function coveredByExclusion(
  startMs: number,
  endMs: number,
  exclusions: ExclusionInput[],
): boolean {
  if (startMs === endMs) {
    return exclusions.some((ex) => startMs >= toMs(ex.startAt) && startMs < toMs(ex.endAt));
  }
  return exclusions.some((ex) => {
    const exStart = toMs(ex.startAt);
    const exEnd = toMs(ex.endAt);
    return overlaps(startMs, endMs, exStart, exEnd) && startMs >= exStart && endMs <= exEnd;
  });
}

function trimVisitAroundExclusions(
  visit: ComputedVisit,
  exclusions: ExclusionInput[],
): ComputedVisit[] {
  const applicable = exclusions.filter((exclusion) => {
    if (visit.correctionId && exclusion.correctionId === visit.correctionId) return false;
    if (visit.source === "admin" && exclusion.adminDayEdit) return false;
    return true;
  });
  const start = toMs(visit.startAt);
  const end = toMs(visit.endAt);
  if (end === start) return coveredByExclusion(start, end, applicable) ? [] : [visit];

  let segments = [{ start, end }];
  for (const exclusion of applicable) {
    const exStart = toMs(exclusion.startAt);
    const exEnd = toMs(exclusion.endAt);
    const next: Array<{ start: number; end: number }> = [];
    for (const segment of segments) {
      if (!overlaps(segment.start, segment.end, exStart, exEnd)) {
        next.push(segment);
        continue;
      }
      if (segment.start < exStart) {
        next.push({ start: segment.start, end: Math.min(segment.end, exStart) });
      }
      if (segment.end > exEnd) {
        next.push({ start: Math.max(segment.start, exEnd), end: segment.end });
      }
    }
    segments = next.filter((segment) => segment.end > segment.start);
  }
  return segments.map((segment) => ({
    ...visit,
    startAt: new Date(segment.start).toISOString(),
    endAt: new Date(segment.end).toISOString(),
    hours: hoursBetween(segment.start, segment.end),
    open: visit.open === true && segment.end === end ? true : undefined,
  }));
}

function trimAroundAdmin(
  startMs: number,
  endMs: number,
  adminRanges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  let segments = [{ start: startMs, end: endMs }];
  for (const admin of adminRanges) {
    const next: Array<{ start: number; end: number }> = [];
    for (const seg of segments) {
      if (!overlaps(seg.start, seg.end, admin.start, admin.end)) {
        next.push(seg);
        continue;
      }
      if (seg.start < admin.start) {
        next.push({ start: seg.start, end: Math.min(seg.end, admin.start) });
      }
      if (seg.end > admin.end) {
        next.push({ start: Math.max(seg.start, admin.end), end: seg.end });
      }
    }
    segments = next.filter((s) => s.end > s.start);
  }
  return segments;
}

/** Split [start,end] into per-local-day segments. */
export function splitAtLocalMidnights(
  startMs: number,
  endMs: number,
  timezone: string,
): Array<{ startMs: number; endMs: number; dayKey: string }> {
  if (endMs <= startMs) return [];
  const out: Array<{ startMs: number; endMs: number; dayKey: string }> = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const dayKey = dayKeyInTz(new Date(cursor), timezone);
    const { endMs: dayEnd } = localDayBounds(dayKey, timezone);
    const segEnd = Math.min(endMs, dayEnd);
    if (segEnd > cursor) {
      out.push({ startMs: cursor, endMs: segEnd, dayKey });
    }
    cursor = segEnd;
    if (cursor <= startMs) break;
  }
  return out;
}

export function matchNearestOffice(
  lat: number,
  lng: number,
  accuracyMeters: number | null | undefined,
  offices: OfficeFenceInput[],
  rules: PresenceRules,
): OfficeFenceInput | null {
  const accuracy = accuracyMeters ?? Number.POSITIVE_INFINITY;
  if (accuracy > rules.fenceRadiusMeters) return null;
  let best: OfficeFenceInput | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const o of offices) {
    const d = haversineMeters(lat, lng, o.lat, o.lng);
    if (d <= o.radiusMeters && d < bestDist) {
      best = o;
      bestDist = d;
    }
  }
  return best;
}

export function computeVisits(args: {
  rules: PresenceRules;
  events: PresenceEventInput[];
  adminVisits?: AdminVisitInput[];
  exclusions?: ExclusionInput[];
  office?: OfficeFenceInput | null;
  offices?: OfficeFenceInput[];
  /** Offices used for points lookup (defaults to offices). Lets deactivated sites keep past points. */
  pointOffices?: OfficeFenceInput[];
  /** Clock for an open visit. Defaults to the current time. Tests pass a fixed instant. */
  now?: number;
  exceptionDays?: ExceptionDayInput[];
}): ComputeResult {
  const rules = args.rules;
  const office = args.office ?? null;
  const offices = args.offices ?? (office ? [office] : []);
  const pointOffices = args.pointOffices ?? offices;
  const exclusions = args.exclusions ?? [];
  const adminVisits = args.adminVisits ?? [];
  const gapMs =
    rules.gapSeconds != null && rules.gapSeconds > 0
      ? rules.gapSeconds * 1000
      : rules.gapMinutes * 60_000;
  // A sample that lands one interval late is still inside, not a leave.
  // Second-based test gaps stay exact. A real absence past this window still splits.
  const continueMs =
    rules.gapSeconds != null && rules.gapSeconds > 0
      ? gapMs
      : gapMs + Math.max(0, rules.sampleIntervalMinutes ?? 0) * 60_000;

  const adminComputed: ComputedVisit[] = adminVisits.map((v) => {
    const start = toMs(v.startAt);
    const end = toMs(v.endAt);
    return {
      startAt: v.startAt,
      endAt: v.endAt,
      source: "admin" as const,
      hours: hoursBetween(start, end),
      officeLocationId: v.officeLocationId,
      pointsAwarded: v.pointsPerVisitDay ?? 0,
      correctionId: v.correctionId ?? null,
    };
  });

  const adminRanges = adminComputed.flatMap((visit) => {
    const start = toMs(visit.startAt);
    const end = toMs(visit.endAt);
    const dayKeys =
      end <= start
        ? [dayKeyInTz(new Date(start), rules.timezone)]
        : splitAtLocalMidnights(start, end, rules.timezone).map((segment) => segment.dayKey);
    return [...new Set(dayKeys)].map((dayKey) => {
      const bounds = localDayBounds(dayKey, rules.timezone);
      return { start: bounds.startMs, end: bounds.endMs };
    });
  });

  const realEvents = [...args.events]
    .filter((e) => !e.simulated)
    .sort((a, b) => toMs(a.at) - toMs(b.at));

  const autoVisits: ComputedVisit[] = [];
  let openStart: number | null = null;
  let lastGood: number | null = null;
  let openSource: "auto" | "manual" = "auto";
  let openOfficeId: string | null = null;
  // Highest pointsAtMatch among the events of the open visit. Null when none has a snapshot.
  let openSnapshot: number | null = null;
  const snapshotOf = (event: PresenceEventInput): number | null =>
    event.pointsAtMatch != null && Number.isFinite(event.pointsAtMatch) ? Math.max(0, Math.round(event.pointsAtMatch)) : null;
  const addSnapshot = (event: PresenceEventInput) => {
    const s = snapshotOf(event);
    if (s != null) openSnapshot = openSnapshot == null ? s : Math.max(openSnapshot, s);
  };
  // Geofence exit is often a bad fix. Keep the visit open until the gap passes
  // with no new inside evidence. A manual check_out still closes immediately.
  let pendingExit: number | null = null;

  const flushPendingExit = () => {
    if (pendingExit == null) return;
    const atExit = pendingExit;
    pendingExit = null;
    closeOpen(atExit);
  };

  const closeOpen = (endMs: number, markOpen = false) => {
    const snapshot = openSnapshot ?? undefined;
    openSnapshot = null;
    if (openStart == null || lastGood == null) {
      openStart = null;
      lastGood = null;
      return;
    }
    const end = Math.max(openStart, endMs);
    if (coveredByExclusion(openStart, end, exclusions)) {
      openStart = null;
      lastGood = null;
      return;
    }
    if (end === openStart) {
      // A single in-office fix is still presence for that calendar day (0 hours).
      const s = openStart;
      const insideAdmin = adminRanges.some((a) => s >= a.start && s <= a.end);
      if (!insideAdmin) {
        autoVisits.push({
          startAt: new Date(s).toISOString(),
          endAt: new Date(s).toISOString(),
          source: openSource,
          hours: 0,
          officeLocationId: openOfficeId,
          pointsAwarded: snapshot,
          open: markOpen ? true : undefined,
        });
      }
      openStart = null;
      lastGood = null;
      openOfficeId = null;
      return;
    }
    const segments = trimAroundAdmin(openStart, end, adminRanges);
    for (const seg of segments) {
      if (coveredByExclusion(seg.start, seg.end, exclusions)) continue;
      const daySegs = splitAtLocalMidnights(seg.start, seg.end, rules.timezone);
      for (const ds of daySegs) {
        autoVisits.push({
          startAt: new Date(ds.startMs).toISOString(),
          endAt: new Date(ds.endMs).toISOString(),
          source: openSource,
          hours: hoursBetween(ds.startMs, ds.endMs),
          officeLocationId: openOfficeId,
          pointsAwarded: snapshot,
          open: markOpen && ds.endMs === end ? true : undefined,
        });
      }
    }
    openStart = null;
    lastGood = null;
    openOfficeId = null;
  };

  for (const event of realEvents) {
    const at = toMs(event.at);
    if (Number.isNaN(at)) continue;

    if (event.type === "check_out") {
      pendingExit = null;
      closeOpen(at);
      continue;
    }
    if (event.type === "exit") {
      if (openStart != null && pendingExit == null) pendingExit = at;
      continue;
    }

    let matched: OfficeFenceInput | null = null;
    if (event.lat != null && event.lng != null && offices.length) {
      matched = matchNearestOffice(event.lat, event.lng, event.accuracyMeters, offices, rules);
    } else if (office) {
      matched = isInsideOffice(event, office, rules) ? office : null;
    }

    const inside =
      event.type === "check_in" ||
      event.type === "enter" ||
      event.officeLocationId != null ||
      matched != null ||
      (office != null && isInsideOffice(event, office, rules));

    if (!inside) {
      if (pendingExit != null) {
        if (at - pendingExit > gapMs) flushPendingExit();
      } else if (openStart != null && lastGood != null && at - lastGood > gapMs) {
        closeOpen(lastGood);
      }
      continue;
    }

    let bridgedExit = false;
    if (pendingExit != null) {
      if (at - pendingExit <= continueMs) {
        pendingExit = null;
        bridgedExit = true;
      } else flushPendingExit();
    }

    if (openStart == null) {
      openStart = at;
      lastGood = at;
      openSource = event.type === "check_in" ? "manual" : "auto";
      openOfficeId = event.officeLocationId ?? matched?.id ?? office?.id ?? null;
      addSnapshot(event);
      continue;
    }

    if (!bridgedExit && lastGood != null && at - lastGood > continueMs) {
      closeOpen(lastGood);
      openStart = at;
      lastGood = at;
      openSource = event.type === "check_in" ? "manual" : "auto";
      openOfficeId = event.officeLocationId ?? matched?.id ?? office?.id ?? null;
      addSnapshot(event);
      continue;
    }

    const evOffice = event.officeLocationId ?? matched?.id ?? null;
    if (evOffice && openOfficeId && evOffice !== openOfficeId) {
      closeOpen(at);
      openStart = at;
      lastGood = at;
      openSource = event.type === "check_in" ? "manual" : "auto";
      openOfficeId = evOffice;
      addSnapshot(event);
      continue;
    }

    lastGood = at;
    if (evOffice) openOfficeId = evOffice;
    addSnapshot(event);
  }

  const now = args.now ?? Date.now();
  if (pendingExit != null) {
    if (now - pendingExit > gapMs) flushPendingExit();
    else closeOpen(now, true);
  } else if (openStart != null && lastGood != null) {
    if (now - lastGood <= continueMs) closeOpen(now, true);
    else closeOpen(lastGood);
  }

  const visits = [...adminComputed, ...autoVisits]
    .flatMap((visit) => trimVisitAroundExclusions(visit, exclusions))
    .sort(
    (a, b) => toMs(a.startAt) - toMs(b.startAt),
  );

  const pointsByOffice = new Map<string, number>();
  for (const o of pointOffices) if (o.id) pointsByOffice.set(o.id, o.pointsPerVisitDay ?? 1);
  for (const v of visits) {
    if (v.source === "admin") {
      // Stored award as is. 0 stays 0 (day turned off).
      v.pointsAwarded = adminVisitPoints(v.pointsAwarded ?? 0);
      continue;
    }
    if (v.pointsAwarded != null) continue;
    // Every event of this visit lacks pointsAtMatch: rows created before the snapshot
    // migration. Only then fall back to the current office weight.
    v.pointsAwarded = pointsByOffice.get(v.officeLocationId ?? "") ?? 1;
  }

  const days = computeDayPoints(visits, rules.timezone, pointOffices, exclusions, args.exceptionDays ?? []);
  const totalHours = days.reduce((sum, day) => sum + day.hours, 0);
  const dayKeysVisited = days.filter((d) => d.visited).map((d) => d.dayKey);
  const totalPoints = days.reduce((s, d) => s + d.points, 0);
  const target = rules.monthlyPointsTarget ?? DEFAULT_POINTS_TARGET;

  return {
    visits,
    totalHours,
    dayMet: totalHours + 1e-9 >= rules.dayHours,
    dayKeysVisited,
    visitDays: dayKeysVisited.length,
    totalPoints,
    targetMet: totalPoints >= target,
    days,
  };
}

export const DEFAULT_POINTS_TARGET = 8;

export function summarizeMonth(days: DayPointsResult[], target: number) {
  const points = days.reduce((s, d) => s + d.points, 0);
  return {
    points,
    visitDays: days.filter((d) => d.visited).length,
    target,
    remaining: Math.max(0, target - points),
    targetMet: points >= target,
  };
}

export function computeDayPoints(
  visits: ComputedVisit[],
  timezone: string,
  offices: OfficeFenceInput[],
  exclusions: ExclusionInput[] = [],
  exceptionDays: ExceptionDayInput[] = [],
): DayPointsResult[] {
  const visitDays = visitDayPoints(visits, timezone, offices, exclusions);
  return mergeExceptionDays(visitDays, exceptionDays);
}

/** Day points = the higher of visit points and exception points. Several exceptions on one day count once. */
export function mergeExceptionDays(
  days: DayPointsResult[],
  exceptionDays: ExceptionDayInput[],
): DayPointsResult[] {
  if (!exceptionDays.length) return days;
  const best = new Map<string, ExceptionDayInput>();
  for (const e of exceptionDays) {
    const points = Math.max(0, Math.round(e.points));
    const cur = best.get(e.dayKey);
    if (!cur || points > cur.points) best.set(e.dayKey, { ...e, points });
  }
  const byKey = new Map(days.map((d) => [d.dayKey, d]));
  for (const [dayKey, e] of best) {
    const exception = { id: e.exceptionId, points: e.points };
    const day = byKey.get(dayKey);
    if (day) {
      byKey.set(dayKey, { ...day, visited: true, points: Math.max(day.points, e.points), exception });
    } else {
      byKey.set(dayKey, {
        dayKey,
        visited: true,
        points: e.points,
        hours: 0,
        firstIn: null,
        lastOut: null,
        officeLocationId: e.officeLocationId ?? null,
        exception,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

function visitDayPoints(
  visits: ComputedVisit[],
  timezone: string,
  offices: OfficeFenceInput[],
  exclusions: ExclusionInput[],
): DayPointsResult[] {
  const byDay = new Map<
    string,
    {
      firstIn: number;
      lastOut: number;
      maxPoints: number;
      officeId: string | null;
      byOffice: Map<string, ComputedVisit[]>;
    }
  >();
  const pointsByOffice = new Map<string, number>();
  for (const o of offices) {
    if (o.id) pointsByOffice.set(o.id, o.pointsPerVisitDay ?? 1);
  }

  for (const v of visits) {
    const start = toMs(v.startAt);
    const end = toMs(v.endAt);
    const segs =
      end <= start
        ? [{ startMs: start, endMs: start, dayKey: dayKeyInTz(new Date(start), timezone) }]
        : splitAtLocalMidnights(start, end, timezone);
    for (const seg of segs) {
      // The visit's own award. The office lookup is only for callers that never set one.
      const pts =
        v.source === "admin"
          ? adminVisitPoints(v.pointsAwarded ?? 0)
          : v.pointsAwarded != null
            ? Math.max(0, Math.round(v.pointsAwarded))
            : pointsByOffice.get(v.officeLocationId ?? "") ?? 1;
      const cur = byDay.get(seg.dayKey) ?? {
        firstIn: seg.startMs,
        lastOut: seg.endMs,
        maxPoints: 0,
        officeId: v.officeLocationId ?? null,
        byOffice: new Map(),
      };
      cur.firstIn = Math.min(cur.firstIn, seg.startMs);
      cur.lastOut = Math.max(cur.lastOut, seg.endMs);
      if (pts >= cur.maxPoints) {
        cur.maxPoints = pts;
        cur.officeId = v.officeLocationId ?? cur.officeId;
      }
      const officeKey = v.officeLocationId ?? "";
      const slices = cur.byOffice.get(officeKey) ?? [];
      slices.push({
        ...v,
        startAt: new Date(seg.startMs).toISOString(),
        endAt: new Date(seg.endMs).toISOString(),
      });
      cur.byOffice.set(officeKey, slices);
      byDay.set(seg.dayKey, cur);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, v]) => {
      const parts: MsRange[] = [];
      for (const slices of v.byOffice.values()) parts.push(...officeSpanParts(slices, exclusions));
      return {
        dayKey,
        visited: true,
        points: v.maxPoints,
        hours: unionHours(parts),
        firstIn: new Date(v.firstIn).toISOString(),
        lastOut: new Date(v.lastOut).toISOString(),
        officeLocationId: v.officeId,
      };
    });
}

export const DEFAULT_RULES: PresenceRules = {
  gapMinutes: 15,
  dayHours: 5,
  monthlyDaysTarget: 8,
  monthlyPointsTarget: 8,
  timezone: "Asia/Kolkata",
  fenceRadiusMeters: 100,
  sampleIntervalMinutes: 10,
  correctionWindowDays: 5,
  correctionRequiresApproval: false,
  correctionAutoApproveLimit: 4,
  correctionRequireSync: true,
  correctionDailyDigest: true,
  appVersionCode: 0,
  appVersionName: "",
  appApkUrl: null,
};
