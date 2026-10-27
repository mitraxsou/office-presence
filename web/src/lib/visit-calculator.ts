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
};

export type AdminVisitInput = {
  startAt: string;
  endAt: string;
  source?: "admin" | "manual";
  officeLocationId?: string | null;
  pointsPerVisitDay?: number | null;
};

export type ExclusionInput = {
  startAt: string;
  endAt: string;
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
};

export type DayPointsResult = {
  dayKey: string;
  visited: boolean;
  points: number;
  hours: number;
  firstIn: string | null;
  lastOut: string | null;
  officeLocationId: string | null;
};

export type ComputeResult = {
  visits: ComputedVisit[];
  totalHours: number;
  /** Advisory only: total hours reached the FYI dayHours figure. Never gates points. */
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

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
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
  return exclusions.some((ex) => {
    const exStart = toMs(ex.startAt);
    const exEnd = toMs(ex.endAt);
    return overlaps(startMs, endMs, exStart, exEnd) && startMs >= exStart && endMs <= exEnd;
  });
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
    };
  });

  const adminRanges = adminComputed.map((v) => ({
    start: toMs(v.startAt),
    end: toMs(v.endAt),
  }));

  const realEvents = [...args.events]
    .filter((e) => !e.simulated)
    .sort((a, b) => toMs(a.at) - toMs(b.at));

  const autoVisits: ComputedVisit[] = [];
  let openStart: number | null = null;
  let lastGood: number | null = null;
  let openSource: "auto" | "manual" = "auto";
  let openOfficeId: string | null = null;

  const closeOpen = (endMs: number) => {
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

    if (event.type === "check_out" || event.type === "exit") {
      closeOpen(at);
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
      matched != null ||
      (office != null && isInsideOffice(event, office, rules));

    if (!inside) {
      if (openStart != null && lastGood != null && at - lastGood > gapMs) {
        closeOpen(lastGood);
      }
      continue;
    }

    if (openStart == null) {
      openStart = at;
      lastGood = at;
      openSource = event.type === "check_in" ? "manual" : "auto";
      openOfficeId = event.officeLocationId ?? matched?.id ?? office?.id ?? null;
      continue;
    }

    if (lastGood != null && at - lastGood > gapMs) {
      closeOpen(lastGood);
      openStart = at;
      lastGood = at;
      openSource = event.type === "check_in" ? "manual" : "auto";
      openOfficeId = event.officeLocationId ?? matched?.id ?? office?.id ?? null;
      continue;
    }

    const evOffice = event.officeLocationId ?? matched?.id ?? null;
    if (evOffice && openOfficeId && evOffice !== openOfficeId) {
      closeOpen(at);
      openStart = at;
      lastGood = at;
      openSource = event.type === "check_in" ? "manual" : "auto";
      openOfficeId = evOffice;
      continue;
    }

    lastGood = at;
    if (evOffice) openOfficeId = evOffice;
  }

  if (openStart != null && lastGood != null) {
    closeOpen(lastGood);
  }

  const filteredAuto = autoVisits.filter(
    (v) => !coveredByExclusion(toMs(v.startAt), toMs(v.endAt), exclusions),
  );

  const visits = [...adminComputed, ...filteredAuto].sort(
    (a, b) => toMs(a.startAt) - toMs(b.startAt),
  );

  const pointsByOffice = new Map<string, number>();
  for (const o of pointOffices) if (o.id) pointsByOffice.set(o.id, o.pointsPerVisitDay ?? 1);
  for (const v of visits) {
    // Admin visits keep an explicit pointsAwarded, including 0 (do not count day).
    if (v.source === "admin") continue;
    v.pointsAwarded =
      pointsByOffice.get(v.officeLocationId ?? "") ?? (v.pointsAwarded && v.pointsAwarded > 0 ? v.pointsAwarded : 1);
  }

  const totalHours = visits.reduce((sum, v) => sum + v.hours, 0);
  const days = computeDayPoints(visits, rules.timezone, pointOffices);
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
): DayPointsResult[] {
  const byDay = new Map<
    string,
    { firstIn: number; lastOut: number; hours: number; maxPoints: number; officeId: string | null }
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
      const pts =
        v.source === "admin"
          ? v.pointsAwarded ?? 0
          : v.pointsAwarded && v.pointsAwarded > 0
            ? v.pointsAwarded
            : pointsByOffice.get(v.officeLocationId ?? "") ?? 1;
      const cur = byDay.get(seg.dayKey) ?? {
        firstIn: seg.startMs,
        lastOut: seg.endMs,
        hours: 0,
        maxPoints: 0,
        officeId: v.officeLocationId ?? null,
      };
      cur.firstIn = Math.min(cur.firstIn, seg.startMs);
      cur.lastOut = Math.max(cur.lastOut, seg.endMs);
      cur.hours += hoursBetween(seg.startMs, seg.endMs);
      if (pts >= cur.maxPoints) {
        cur.maxPoints = pts;
        cur.officeId = v.officeLocationId ?? cur.officeId;
      }
      byDay.set(seg.dayKey, cur);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, v]) => ({
      dayKey,
      visited: true,
      points: v.maxPoints,
      hours: v.hours,
      firstIn: new Date(v.firstIn).toISOString(),
      lastOut: new Date(v.lastOut).toISOString(),
      officeLocationId: v.officeId,
    }));
}

export const DEFAULT_RULES: PresenceRules = {
  gapMinutes: 15,
  dayHours: 5,
  monthlyDaysTarget: 8,
  monthlyPointsTarget: 8,
  timezone: "Asia/Kolkata",
  fenceRadiusMeters: 100,
  sampleIntervalMinutes: 5,
  correctionWindowDays: 5,
};
