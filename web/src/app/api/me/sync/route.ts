import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";
import { recomputeUserPresence } from "@/lib/presence";
import { officesForUser } from "@/lib/offices-view";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const { user, device } = actor;

  const s = await recomputeUserPresence(user.id);
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
  });
}
