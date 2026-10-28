import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getPolicy } from "./policy";
import { listActiveOffices, listPointOffices, toFence } from "./offices";
import {
  computeVisits,
  dayKeyInTz,
  localDayBounds,
  matchNearestOffice,
  summarizeMonth,
  DEFAULT_POINTS_TARGET,
  type PresenceEventInput,
  type AdminVisitInput,
  type ExclusionInput,
  type ComputedVisit,
  type DayPointsResult,
} from "./visit-calculator";
import { sendTeamsNotification, type TeamsPayload } from "./notifications";
import { buildDayOfficesPayload } from "./office-day";

export function monthKeyInTz(date: Date, timezone: string) {
  return dayKeyInTz(date, timezone).slice(0, 7);
}

export function monthBounds(timezone: string, monthKey?: string) {
  const key = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : monthKeyInTz(new Date(), timezone);
  const [y, m] = key.split("-").map(Number);
  const nextKey = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const start = new Date(localDayBounds(`${key}-01`, timezone).startMs);
  const end = new Date(localDayBounds(`${nextKey}-01`, timezone).startMs);
  return { start, end, monthKey: key };
}

export type DayDetail = DayPointsResult & {
  officeName: string | null;
  intervals: Array<{
    startAt: string;
    endAt: string;
    hours: number;
    officeName: string | null;
    officeId: string | null;
    source: string;
  }>;
  /** SPEC 13 / corrections-api day detail shape (additive). */
  offices: Array<{
    office_id: string | null;
    name: string;
    minutes: number;
    visits: Array<{ in_at: string; out_at: string; minutes: number }>;
  }>;
  travel_minutes: number;
  total_minutes: number;
};

async function officeNameResolver(userId: string) {
  const [all, aliases] = await Promise.all([
    prisma.officeLocation.findMany({ select: { id: true, name: true } }),
    prisma.userOfficeAlias.findMany({ where: { userId } }),
  ]);
  const names = new Map(all.map((o) => [o.id, o.name]));
  for (const a of aliases) names.set(a.officeLocationId, a.displayName);
  return (id: string | null | undefined) => (id ? names.get(id) ?? null : null);
}

async function computeForRange(userId: string, monthKey?: string) {
  const rules = await getPolicy();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const timezone = user.timezone || rules.timezone;
  const userRules = { ...rules, timezone };
  const { start, end, monthKey: key } = monthBounds(timezone, monthKey);
  const [active, pointRows] = await Promise.all([listActiveOffices(), listPointOffices()]);
  const pointOffices = pointRows.map(toFence);

  const [events, adminVisits, exclusions] = await Promise.all([
    prisma.presenceEvent.findMany({
      where: { userId, simulated: false, recordedAt: { gte: start, lt: end } },
      orderBy: { recordedAt: "asc" },
    }),
    prisma.visit.findMany({
      where: {
        userId,
        source: { in: ["admin", "correction"] },
        startAt: { lt: end },
        endAt: { gte: start },
      },
    }),
    prisma.visitExclusion.findMany({
      where: { userId, startAt: { lt: end }, endAt: { gte: start } },
    }),
  ]);

  const eventInputs: PresenceEventInput[] = events.map((e) => ({
    type: e.type as PresenceEventInput["type"],
    at: e.recordedAt.toISOString(),
    lat: e.latitude,
    lng: e.longitude,
    accuracyMeters: e.accuracyMeters,
    simulated: e.simulated,
    officeLocationId: e.officeLocationId,
  }));
  const adminInputs: AdminVisitInput[] = adminVisits
    .filter((v) => v.endAt)
    .map((v) => ({
      startAt: v.startAt.toISOString(),
      endAt: v.endAt!.toISOString(),
      source: "admin" as const,
      officeLocationId: v.officeLocationId,
      pointsPerVisitDay: v.pointsAwarded || undefined,
    }));
  const exclusionInputs: ExclusionInput[] = exclusions.map((e) => ({
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
  }));

  const result = computeVisits({
    rules: userRules,
    events: eventInputs,
    adminVisits: adminInputs,
    exclusions: exclusionInputs,
    offices: active,
    pointOffices,
  });
  return { rules: userRules, user, timezone, monthKey: key, start, end, events, active, result };
}

function attachDetails(
  days: DayPointsResult[],
  visits: ComputedVisit[],
  timezone: string,
  nameOf: (id: string | null | undefined) => string | null,
): DayDetail[] {
  return days.map((d) => {
    const intervals = visits
      .filter((v) => dayKeyInTz(new Date(v.startAt), timezone) === d.dayKey)
      .map((v) => ({
        startAt: v.startAt,
        endAt: v.endAt,
        hours: v.hours,
        officeName: nameOf(v.officeLocationId),
        officeId: v.officeLocationId ?? null,
        source: v.source,
      }));
    const payload = buildDayOfficesPayload(d.dayKey, d.points, d.hours, intervals);
    return {
      ...d,
      officeName: nameOf(d.officeLocationId),
      intervals,
      offices: payload.offices,
      travel_minutes: payload.travel_minutes,
      total_minutes: payload.total_minutes,
    };
  });
}

/** Read-only month view for reports and calendars. Does not write visits or status. */
export async function computeUserMonth(userId: string, monthKey?: string) {
  const c = await computeForRange(userId, monthKey);
  const nameOf = await officeNameResolver(userId);
  const target = c.rules.monthlyPointsTarget ?? DEFAULT_POINTS_TARGET;
  return {
    monthKey: c.monthKey,
    timezone: c.timezone,
    rules: c.rules,
    summary: summarizeMonth(c.result.days, target),
    days: attachDetails(c.result.days, c.result.visits, c.timezone, nameOf),
  };
}

/**
 * Build the same month-view shape as computeUserMonth from a just-finished
 * recomputeUserPresence result so reports avoid a second computeForRange.
 */
export async function monthViewFromRecompute(
  userId: string,
  recomputed: Awaited<ReturnType<typeof recomputeUserPresence>>,
  monthKey: string,
) {
  const nameOf = await officeNameResolver(userId);
  const timezone = recomputed.rules.timezone;
  const target = recomputed.pointsTarget;
  return {
    monthKey,
    timezone,
    rules: recomputed.rules,
    summary: summarizeMonth(recomputed.dayPoints, target),
    days: attachDetails(recomputed.dayPoints, recomputed.visits, timezone, nameOf),
  };
}

export type RecomputeOpts = {
  /** Queue and flush Teams alerts (enter/exit / sync / corrections). Default true. */
  flushAlerts?: boolean;
};

/**
 * Cheap live status update from the latest evidence without rewriting month visits.
 * Used for sample-only ingest to cut Vercel Hobby CPU.
 */
export async function touchStatusFromLatestEvidence(userId: string) {
  const [rules, active, existing, latest] = await Promise.all([
    getPolicy(),
    listActiveOffices(),
    prisma.currentStatus.findUnique({ where: { userId } }),
    prisma.presenceEvent.findFirst({
      where: { userId },
      orderBy: { recordedAt: "desc" },
    }),
  ]);
  const nameOf = await officeNameResolver(userId);
  const target = rules.monthlyPointsTarget ?? DEFAULT_POINTS_TARGET;
  const gapMs =
    (rules.gapSeconds != null && rules.gapSeconds > 0 ? rules.gapSeconds : rules.gapMinutes * 60) * 1000;

  let inOffice = false;
  let sinceAt: Date | null = existing?.sinceAt ?? null;
  let officeLocationId: string | null = null;
  if (latest && ["enter", "sample", "check_in"].includes(latest.type)) {
    if (Date.now() - latest.recordedAt.getTime() <= gapMs) {
      const matched =
        latest.latitude != null && latest.longitude != null
          ? matchNearestOffice(latest.latitude, latest.longitude, latest.accuracyMeters, active, rules)
          : null;
      // Samples outside every fence (or weak fixes) must not keep a stuck In / Unknown office.
      officeLocationId = matched?.id ?? latest.officeLocationId ?? null;
      inOffice = officeLocationId != null;
      if (inOffice) {
        if (!existing?.inOffice || existing.officeLocationId !== officeLocationId) {
          sinceAt = latest.recordedAt;
        } else {
          sinceAt = existing.sinceAt ?? latest.recordedAt;
        }
      } else {
        sinceAt = null;
      }
    } else {
      sinceAt = null;
    }
  } else {
    sinceAt = null;
  }
  const officeName = nameOf(officeLocationId);
  const lastDeviceName = latest?.deviceName ?? existing?.lastDeviceName ?? null;
  const statusData = {
    inOffice,
    sinceAt,
    hoursToday: existing?.hoursToday ?? 0,
    pointsToday: existing?.pointsToday ?? 0,
    monthPoints: existing?.monthPoints ?? 0,
    monthVisitDays: existing?.monthVisitDays ?? 0,
    monthDays: existing?.monthDays ?? 0,
    officeLocationId,
    officeName,
    lastDeviceName,
    lastEvidenceAt: latest?.recordedAt ?? null,
  };
  await prisma.currentStatus.upsert({
    where: { userId },
    create: { userId, ...statusData },
    update: statusData,
  });
  const monthPoints = statusData.monthPoints;
  return {
    hoursToday: statusData.hoursToday,
    pointsToday: statusData.pointsToday,
    monthPoints,
    monthVisitDays: statusData.monthVisitDays,
    monthDays: statusData.monthDays,
    pointsTarget: target,
    pointsRemaining: Math.max(0, target - monthPoints),
    targetMet: monthPoints >= target,
    dayHoursAdvisory: rules.dayHours,
    inOffice,
    sinceAt,
    officeLocationId,
    officeName,
    lastDeviceName,
    visits: [] as ComputedVisit[],
    dayPoints: [] as DayPointsResult[],
    rules,
  };
}

export async function recomputeUserPresence(userId: string, opts: RecomputeOpts = {}) {
  const flushAlerts = opts.flushAlerts !== false;
  const c = await computeForRange(userId);
  const { rules, user, timezone, events, active, result } = c;
  const nameOf = await officeNameResolver(userId);
  const today = dayKeyInTz(new Date(), timezone);
  const target = rules.monthlyPointsTarget ?? DEFAULT_POINTS_TARGET;
  const summary = summarizeMonth(result.days, target);
  const todayRow = result.days.find((d) => d.dayKey === today);

  await prisma.visit.deleteMany({
    where: { userId, source: { in: ["auto", "manual"] }, startAt: { gte: c.start, lt: c.end } },
  });
  const autoVisits = result.visits.filter((x) => x.source !== "admin");
  if (autoVisits.length) {
    await prisma.visit.createMany({
      data: autoVisits.map((v) => ({
        userId,
        startAt: new Date(v.startAt),
        endAt: new Date(v.endAt),
        source: v.source,
        officeLocationId: v.officeLocationId ?? null,
        pointsAwarded: v.pointsAwarded ?? 0,
      })),
    });
  }

  const latest = events[events.length - 1];
  let inOffice = false;
  let sinceAt: Date | null = null;
  let officeLocationId: string | null = null;
  if (latest && ["enter", "sample", "check_in"].includes(latest.type)) {
    const gapMs =
      (rules.gapSeconds != null && rules.gapSeconds > 0 ? rules.gapSeconds : rules.gapMinutes * 60) * 1000;
    if (Date.now() - latest.recordedAt.getTime() <= gapMs) {
      const matched =
        latest.latitude != null && latest.longitude != null
          ? matchNearestOffice(latest.latitude, latest.longitude, latest.accuracyMeters, active, rules)
          : null;
      officeLocationId = matched?.id ?? latest.officeLocationId ?? null;
      inOffice = officeLocationId != null;
      if (inOffice) {
        sinceAt = continuousStart(result.visits, latest.recordedAt.getTime());
      }
    }
  }
  const officeName = nameOf(officeLocationId);
  const lastDeviceName = [...events].reverse().find((e) => e.deviceName)?.deviceName ?? null;
  const hoursToday = todayRow?.hours ?? 0;
  const pointsToday = todayRow?.points ?? 0;

  const statusData = {
    inOffice,
    sinceAt,
    hoursToday,
    pointsToday,
    monthPoints: summary.points,
    monthVisitDays: summary.visitDays,
    monthDays: summary.visitDays,
    officeLocationId,
    officeName,
    lastDeviceName,
    lastEvidenceAt: latest?.recordedAt ?? null,
  };
  await prisma.currentStatus.upsert({
    where: { userId },
    create: { userId, ...statusData },
    update: statusData,
  });

  if (flushAlerts) {
    await queueAlerts({
      userId,
      email: user.email,
      name: user.name ?? user.email.split("@")[0],
      timezone,
      today,
      monthKey: c.monthKey,
      inOffice,
      officeName,
      summary,
      hoursToday,
      dayHours: rules.dayHours,
    });
    await flushPendingAlerts(userId);
  }

  return {
    hoursToday,
    pointsToday,
    monthPoints: summary.points,
    monthVisitDays: summary.visitDays,
    monthDays: summary.visitDays,
    pointsTarget: target,
    pointsRemaining: summary.remaining,
    targetMet: summary.targetMet,
    dayHoursAdvisory: rules.dayHours,
    inOffice,
    sinceAt,
    officeLocationId,
    officeName,
    lastDeviceName,
    visits: result.visits,
    dayPoints: result.days,
    rules,
  };
}

/** True when currentStatus evidence is still within the visit gap window. */
export async function isStatusFresh(userId: string): Promise<boolean> {
  const [rules, status] = await Promise.all([
    getPolicy(),
    prisma.currentStatus.findUnique({ where: { userId }, select: { lastEvidenceAt: true, updatedAt: true } }),
  ]);
  const at = status?.lastEvidenceAt ?? status?.updatedAt;
  if (!at) return false;
  const gapMs =
    (rules.gapSeconds != null && rules.gapSeconds > 0 ? rules.gapSeconds : rules.gapMinutes * 60) * 1000;
  return Date.now() - at.getTime() <= gapMs;
}

/** Start of the visit chain that contains `atMs`, joining segments split at local midnight. */
function continuousStart(visits: ComputedVisit[], atMs: number): Date | null {
  const sorted = [...visits].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  let idx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (Date.parse(sorted[i].startAt) <= atMs) idx = i;
  }
  if (idx < 0) return new Date(atMs);
  let start = Date.parse(sorted[idx].startAt);
  for (let i = idx - 1; i >= 0; i--) {
    if (Date.parse(sorted[i].endAt) === start) start = Date.parse(sorted[i].startAt);
    else break;
  }
  return new Date(start);
}

function localHour(timezone: string) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(new Date()),
  );
}

async function queueAlerts(a: {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  today: string;
  monthKey: string;
  inOffice: boolean;
  officeName: string | null;
  summary: ReturnType<typeof summarizeMonth>;
  hoursToday: number;
  dayHours: number;
}) {
  const prefs = await prisma.userNotificationPrefs.findUnique({ where: { userId: a.userId } });
  const base = { email: a.email, name: a.name, hoursToday: a.hoursToday, hoursTarget: a.dayHours };
  const enterOn = prefs?.notifyOfficeEnter ?? prefs?.notifyOfficeDetected ?? true;
  if (a.inOffice && enterOn) {
    await enqueueAlert(a.userId, "hours_started", a.today, {
      ...base,
      type: "hours_started",
      message: `Office presence detected${a.officeName ? ` at ${a.officeName}` : ""}. Today counts as a visit day.`,
    });
  }
  if (a.summary.targetMet && prefs?.notifyGoalMet !== false) {
    await enqueueAlert(a.userId, "points_met", a.monthKey, {
      ...base,
      type: "hours_met",
      message: `Goal met: ${a.summary.points} / ${a.summary.target} points this month.`,
    });
  }
  if (!a.summary.targetMet && prefs?.notifyDailySummary !== false && localHour(a.timezone) >= 9) {
    await enqueueAlert(a.userId, "daily_summary", a.today, {
      ...base,
      type: "custom",
      message:
        `Office points: ${a.summary.points} / ${a.summary.target} this month, ${a.summary.remaining} to go. ` +
        `Hours today ${a.hoursToday.toFixed(1)} (advised ${a.dayHours}).`,
    });
  }
}

async function enqueueAlert(
  userId: string,
  type: "hours_started" | "points_met" | "daily_summary",
  dayKey: string,
  payload: TeamsPayload,
) {
  await prisma.pendingAlert.upsert({
    where: { userId_type_dayKey: { userId, type, dayKey } },
    create: { userId, type, dayKey, payload: payload as unknown as Prisma.InputJsonValue },
    update: {},
  });
}

export async function flushPendingAlerts(userId: string) {
  const pending = await prisma.pendingAlert.findMany({ where: { userId, sentAt: null } });
  for (const alert of pending) {
    const payload = alert.payload as unknown as TeamsPayload;
    const ok = await sendTeamsNotification(payload);
    if (ok) {
      await prisma.pendingAlert.update({ where: { id: alert.id }, data: { sentAt: new Date() } });
    }
  }
}
