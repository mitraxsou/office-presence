import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import {
  computeUserMonth,
  isStatusFresh,
  monthKeyInTz,
  monthViewFromRecompute,
  recomputeUserPresence,
} from "@/lib/presence";
import { getPolicy } from "@/lib/policy";
import { prisma } from "@/lib/db";
import { dayKeyInTz } from "@/lib/visit-calculator";

export async function GET(request: Request) {
  const started = Date.now();
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const userId = actor.user.id;
  const sp = new URL(request.url).searchParams;
  const tz = actor.user.timezone || "Asia/Kolkata";
  const current = monthKeyInTz(new Date(), tz);
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : current;
  const force = sp.get("recompute") === "1";
  const pastMonth = month !== current;

  let live: Awaited<ReturnType<typeof liveFromCache>>;
  let view: Awaited<ReturnType<typeof computeUserMonth>>;
  let recomputed = false;

  // Past months: never rewrite current visits; read-only month compute + cached live strip.
  if (pastMonth) {
    live = await liveFromCache(userId);
    view = await computeUserMonth(userId, month);
  } else {
    const fresh = !force && (await isStatusFresh(userId));
    if (fresh) {
      live = await liveFromCache(userId);
      view = await computeUserMonth(userId, month);
    } else {
      const result = await recomputeUserPresence(userId, { flushAlerts: true });
      recomputed = true;
      live = {
        inOffice: result.inOffice,
        sinceAt: result.sinceAt,
        officeName: result.officeName,
        hoursToday: result.hoursToday,
        pointsToday: result.pointsToday,
        dayHoursAdvisory: result.dayHoursAdvisory,
      };
      // Reuse the recompute result so we do not run computeForRange twice.
      view = await monthViewFromRecompute(userId, result, month);
    }
  }

  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(31, Math.max(5, Number(sp.get("pageSize") ?? 31)));
  const daysDesc = [...view.days].reverse();
  const todayKey = dayKeyInTz(new Date(), view.timezone);
  const todayDay = view.days.find((d) => d.dayKey === todayKey) ?? null;

  recordApiActivity({
    userId,
    deviceTokenId: actor.device?.id,
    method: "GET",
    path: "/api/me/reports",
    statusCode: 200,
    durationMs: Date.now() - started,
    note: pastMonth ? "past" : recomputed ? "recomputed" : "fresh",
  });

  return NextResponse.json({
    month: view.monthKey,
    currentMonth: current,
    timezone: view.timezone,
    monthPoints: view.summary.points,
    monthVisitDays: view.summary.visitDays,
    pointsTarget: view.summary.target,
    pointsRemaining: view.summary.remaining,
    targetMet: view.summary.targetMet,
    recomputed,
    today: {
      inOffice: live.inOffice,
      sinceAt: live.sinceAt?.toISOString() ?? null,
      officeName: live.officeName,
      hoursToday: live.hoursToday,
      pointsToday: live.pointsToday,
      offices: todayDay?.offices ?? [],
      travel_minutes: todayDay?.travel_minutes ?? 0,
      total_minutes: todayDay?.total_minutes ?? Math.round((live.hoursToday || 0) * 60),
      intervals: todayDay?.intervals ?? [],
    },
    hoursToday: live.hoursToday,
    dayHoursAdvisory: view.rules.dayHours,
    days: daysDesc.slice((page - 1) * pageSize, page * pageSize),
    calendar: view.days.map((d) => ({
      dayKey: d.dayKey,
      points: d.points,
      officeName: d.officeName,
      offices: d.offices,
      travel_minutes: d.travel_minutes,
    })),
    pagination: { page, pageSize, total: view.days.length },
  });
}

async function liveFromCache(userId: string) {
  const [rules, row] = await Promise.all([
    getPolicy(),
    prisma.currentStatus.findUnique({ where: { userId } }),
  ]);
  return {
    inOffice: row?.inOffice ?? false,
    sinceAt: row?.sinceAt ?? null,
    officeName: row?.officeName ?? null,
    hoursToday: row?.hoursToday ?? 0,
    pointsToday: row?.pointsToday ?? 0,
    dayHoursAdvisory: rules.dayHours,
  };
}
