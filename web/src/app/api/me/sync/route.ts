import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import { getPolicy } from "@/lib/policy";
import { isStatusFresh, monthKeyInTz, recomputeUserPresence } from "@/lib/presence";
import { officesForUser } from "@/lib/offices-view";
import { dayKeyInTz } from "@/lib/visit-calculator";
import { groupTodayOffices } from "@/lib/today-offices";
import { monthContentVersion, parseClientMonthVersions } from "@/lib/year-stats";

export async function GET(request: Request) {
  const started = Date.now();
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const { user, device } = actor;
  const url = new URL(request.url);
  const force = url.searchParams.get("recompute") === "1";
  const clientVersions = parseClientMonthVersions(url.searchParams.get("months"));

  const fresh = !force && (await isStatusFresh(user.id));
  const s = fresh
    ? await statusFromCache(user.id)
    : await recomputeUserPresence(user.id, { flushAlerts: true });

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [visits, offices, prefs, decided] = await Promise.all([
    prisma.visit.findMany({ where: { userId: user.id }, orderBy: { startAt: "desc" }, take: 60 }),
    officesForUser(user.id),
    prisma.userNotificationPrefs.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
    prisma.visitCorrectionRequest.findMany({
      where: {
        userId: user.id,
        status: { in: ["approved", "rejected"] },
        reviewedAt: { gte: since },
      },
      orderBy: { reviewedAt: "desc" },
      take: 40,
    }),
  ]);
  const first = offices[0] ?? null;
  const tz = user.timezone || s.rules.timezone || "Asia/Kolkata";
  const todayKey = dayKeyInTz(new Date(), tz);
  const officeNameById = new Map(offices.map((o) => [o.id, o.name]));
  const todayOffices = groupTodayOffices(visits, todayKey, tz, officeNameById);

  const currentMonth = monthKeyInTz(new Date(), tz);
  const monthKeys = recentMonthKeys(currentMonth, 3);
  const monthVersions: Record<string, string> = {};
  await Promise.all(
    monthKeys.map(async (mk) => {
      monthVersions[mk] = await monthContentVersion(user.id, mk, tz);
    }),
  );

  // Months the client should refetch (version mismatch or recent correction / admin edit).
  const dirtyFromDecisions = decided
    .map((r) => r.dayKey.slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m));
  const dirtyFromVersions = monthKeys.filter((m) => {
    if (!clientVersions.has(m)) return false;
    return clientVersions.get(m) !== monthVersions[m];
  });
  const dirtyMonths = [...new Set([...dirtyFromDecisions, ...dirtyFromVersions])];

  const allVersionsMatch =
    clientVersions.size > 0 &&
    monthKeys.every((m) => clientVersions.has(m) && clientVersions.get(m) === monthVersions[m]);

  // A decided correction for today must not leave the phone on a 304 with an empty
  // todayOffices cache from the pending period. Month versions usually bump on
  // approve; this keeps the full body when today itself was decided recently.
  const todayHasDecision = decided.some((r) => r.dayKey === todayKey);

  if (!force && fresh && allVersionsMatch && !todayHasDecision) {
    recordApiActivity({
      userId: user.id,
      deviceTokenId: device?.id,
      method: "GET",
      path: "/api/me/sync",
      statusCode: 304,
      durationMs: Date.now() - started,
      note: "not-modified",
    });
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: `W/"${Object.entries(monthVersions)
          .map(([k, v]) => `${k}:${v}`)
          .join(",")}"`,
      },
    });
  }

  const correctionDecisions = decided.map((r) => ({
    id: r.id,
    dayKey: r.dayKey,
    status: r.status,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    effect: {
      summary:
        r.status === "approved"
          ? "Approved - day totals updated"
          : r.reviewNote
            ? `Not approved: ${r.reviewNote}`
            : "Not approved",
    },
  }));

  recordApiActivity({
    userId: user.id,
    deviceTokenId: device?.id,
    method: "GET",
    path: "/api/me/sync",
    statusCode: 200,
    durationMs: Date.now() - started,
    note: fresh ? "fresh" : "recomputed",
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      timezone: user.timezone,
      developerMode: user.developerMode,
      sharePresenceWithPeers: user.sharePresenceWithPeers,
    },
    device: device ? { id: device.id, label: device.label, platform: device.platform } : null,
    policy: s.rules,
    offices,
    office: first
      ? { name: first.name, latitude: first.latitude, longitude: first.longitude, radiusMeters: first.radiusMeters }
      : null,
    prefs,
    status: {
      inOffice: s.inOffice,
      sinceAt: s.sinceAt?.toISOString() ?? null,
      officeLocationId: s.officeLocationId,
      officeName: s.officeName,
      lastDeviceName: s.lastDeviceName,
    },
    inOffice: s.inOffice,
    officeName: s.officeName,
    pointsToday: s.pointsToday,
    monthPoints: s.monthPoints,
    monthVisitDays: s.monthVisitDays,
    pointsTarget: s.pointsTarget,
    pointsRemaining: s.pointsRemaining,
    targetMet: s.targetMet,
    hoursToday: s.hoursToday,
    dayHoursAdvisory: s.dayHoursAdvisory,
    monthDays: s.monthDays,
    recomputed: !fresh,
    todayOffices,
    visits: visits.map((v) => ({
      id: v.id,
      startAt: v.startAt.toISOString(),
      endAt: v.endAt?.toISOString() ?? null,
      source: v.source,
      reason: v.reason,
      officeLocationId: v.officeLocationId,
      pointsAwarded: v.pointsAwarded,
      editedByAdmin: v.source === "admin" || Boolean(v.editedBy),
    })),
    correctionDecisions,
    monthVersions,
    dirtyMonths,
    generatedAt: new Date().toISOString(),
  });
}

function recentMonthKeys(current: string, count: number): string[] {
  const [y0, m0] = current.split("-").map(Number);
  const out: string[] = [];
  let y = y0;
  let m = m0;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

async function statusFromCache(userId: string) {
  const [rules, row] = await Promise.all([
    getPolicy(),
    prisma.currentStatus.findUnique({ where: { userId } }),
  ]);
  const target = rules.monthlyPointsTarget ?? 8;
  const monthPoints = row?.monthPoints ?? 0;
  return {
    hoursToday: row?.hoursToday ?? 0,
    pointsToday: row?.pointsToday ?? 0,
    monthPoints,
    monthVisitDays: row?.monthVisitDays ?? 0,
    monthDays: row?.monthDays ?? 0,
    pointsTarget: target,
    pointsRemaining: Math.max(0, target - monthPoints),
    targetMet: monthPoints >= target,
    dayHoursAdvisory: rules.dayHours,
    inOffice: row?.inOffice ?? false,
    sinceAt: row?.sinceAt ?? null,
    officeLocationId: row?.officeLocationId ?? null,
    officeName: row?.officeName ?? null,
    lastDeviceName: row?.lastDeviceName ?? null,
    rules,
  };
}

