/** Group day intervals by office for multi-office day UI (SPEC 13). */

export type DayInterval = {
  startAt: string;
  endAt: string;
  hours: number;
  officeName?: string | null;
  officeId?: string | null;
};

export type OfficeGroup = {
  key: string;
  name: string;
  hours: number;
  minutes: number;
  office_id: string | null;
  visits: DayInterval[];
};

export type TimelineSeg = {
  /** Minutes from local midnight. */
  startMin: number;
  endMin: number;
  /** 0 = ink, 1 = ink-3, 2 = ink-2 */
  tone: 0 | 1 | 2;
  officeKey: string;
};

export type DayOfficesPayload = {
  day: string;
  counts_as: number;
  total_minutes: number;
  travel_minutes: number;
  offices: Array<{
    office_id: string | null;
    name: string;
    minutes: number;
    visits: Array<{ in_at: string; out_at: string; minutes: number }>;
  }>;
};

export function groupOfficesFromIntervals(intervals: DayInterval[]): OfficeGroup[] {
  const order: string[] = [];
  const map = new Map<string, OfficeGroup>();
  for (const iv of intervals) {
    const name = (iv.officeName || "").trim() || "Office";
    const key = (iv.officeId || "").trim() || name;
    let g = map.get(key);
    if (!g) {
      g = { key, name, hours: 0, minutes: 0, office_id: (iv.officeId || "").trim() || null, visits: [] };
      map.set(key, g);
      order.push(key);
    }
    g.visits.push(iv);
    g.hours += Number(iv.hours) || 0;
    g.minutes = Math.round(g.hours * 60);
  }
  return order.map((k) => map.get(k)!);
}

export function calendarOfficeLabel(
  intervals: DayInterval[] | undefined,
  fallbackOffice: string | null | undefined,
): string {
  const groups = groupOfficesFromIntervals(intervals || []);
  if (groups.length >= 2) return `${groups.length} offices`;
  if (groups.length === 1) return shortOffice(groups[0].name);
  return shortOffice(fallbackOffice || "");
}

function shortOffice(name: string): string {
  const n = name.trim();
  if (!n) return "";
  const comma = n.indexOf(",");
  return comma > 0 ? n.slice(0, comma).trim() : n;
}

/** Travel = wall-clock span minus sum of visit hours (SPEC 13). */
export function travelMinutes(intervals: DayInterval[], totalHours: number): number {
  if (!intervals.length) return 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const iv of intervals) {
    const s = Date.parse(iv.startAt);
    const e = Date.parse(iv.endAt);
    if (Number.isFinite(s)) minStart = Math.min(minStart, s);
    if (Number.isFinite(e)) maxEnd = Math.max(maxEnd, e);
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd) || maxEnd <= minStart) return 0;
  const spanMin = (maxEnd - minStart) / 60_000;
  const officeMin = (Number(totalHours) || 0) * 60;
  return Math.max(0, Math.round(spanMin - officeMin));
}

export function buildDayOfficesPayload(
  dayKey: string,
  countsAs: number,
  totalHours: number,
  intervals: DayInterval[],
): DayOfficesPayload {
  const groups = groupOfficesFromIntervals(intervals);
  const total_minutes = Math.round((Number(totalHours) || 0) * 60);
  return {
    day: dayKey,
    counts_as: countsAs,
    total_minutes,
    travel_minutes: travelMinutes(intervals, totalHours),
    offices: groups.map((g) => ({
      office_id: g.office_id,
      name: g.name,
      minutes: g.minutes,
      visits: g.visits.map((v) => ({
        in_at: v.startAt,
        out_at: v.endAt,
        minutes: Math.round((Number(v.hours) || 0) * 60),
      })),
    })),
  };
}

/** Local minutes-from-midnight for an ISO instant in a timezone. */
export function localMinutesOfDay(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * 8 am to 8 pm timeline segments (extend if a visit is outside).
 * Neutral tones only: first office ink, second ink-3, third ink-2.
 */
export function timelineSegments(
  intervals: DayInterval[],
  timeZone: string,
): { startMin: number; endMin: number; labels: string[]; segs: TimelineSeg[] } {
  const groups = groupOfficesFromIntervals(intervals);
  const toneByKey = new Map<string, 0 | 1 | 2>();
  groups.forEach((g, i) => toneByKey.set(g.key, (Math.min(i, 2) as 0 | 1 | 2)));

  const segs: TimelineSeg[] = [];
  let minSeen = 8 * 60;
  let maxSeen = 20 * 60;
  for (const iv of intervals) {
    const key = (iv.officeId || "").trim() || (iv.officeName || "").trim() || "Office";
    let s = localMinutesOfDay(iv.startAt, timeZone);
    let e = localMinutesOfDay(iv.endAt, timeZone);
    if (e <= s) e = s + 1;
    minSeen = Math.min(minSeen, s);
    maxSeen = Math.max(maxSeen, e);
    segs.push({
      startMin: s,
      endMin: e,
      tone: toneByKey.get(key) ?? 0,
      officeKey: key,
    });
  }

  // Default window 8am-8pm; extend outward if needed.
  let startMin = 8 * 60;
  let endMin = 20 * 60;
  if (minSeen < startMin) startMin = Math.floor(minSeen / 60) * 60;
  if (maxSeen > endMin) endMin = Math.ceil(maxSeen / 60) * 60;
  if (endMin <= startMin) endMin = startMin + 60;

  const span = endMin - startMin;
  const step = span <= 12 * 60 ? 3 * 60 : Math.ceil(span / 4 / 60) * 60;
  const labels: string[] = [];
  for (let t = startMin; t <= endMin; t += step) {
    labels.push(fmtHourLabel(t));
  }
  if (labels[labels.length - 1] !== fmtHourLabel(endMin)) labels.push(fmtHourLabel(endMin));

  return { startMin, endMin, labels, segs };
}

function fmtHourLabel(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  if (h === 0) return "12 am";
  if (h < 12) return `${h} am`;
  if (h === 12) return "12 pm";
  return `${h - 12} pm`;
}

export function timelinePct(min: number, windowStart: number, windowEnd: number): number {
  const span = Math.max(1, windowEnd - windowStart);
  return ((min - windowStart) / span) * 100;
}
