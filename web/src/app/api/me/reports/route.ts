import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { computeUserMonth, monthKeyInTz, recomputeUserPresence } from "@/lib/presence";
import { dayKeyInTz } from "@/lib/visit-calculator";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const userId = actor.user.id;
  const sp = new URL(request.url).searchParams;
  const tz = actor.user.timezone || "Asia/Kolkata";
  const current = monthKeyInTz(new Date(), tz);
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : current;

  const live = await recomputeUserPresence(userId);
  const view = await computeUserMonth(userId, month);
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(31, Math.max(5, Number(sp.get("pageSize") ?? 31)));
  const daysDesc = [...view.days].reverse();
  const todayKey = dayKeyInTz(new Date(), view.timezone);
  const todayDay = view.days.find((d) => d.dayKey === todayKey) ?? null;

  return NextResponse.json({
    month: view.monthKey,
    currentMonth: current,
    timezone: view.timezone,
    monthPoints: view.summary.points,
    monthVisitDays: view.summary.visitDays,
    pointsTarget: view.summary.target,
    pointsRemaining: view.summary.remaining,
    targetMet: view.summary.targetMet,
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
