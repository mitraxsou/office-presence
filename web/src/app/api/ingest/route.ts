import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import { cleanDeviceLabel } from "@/lib/otp";
import { recomputeUserPresence, touchStatusFromLatestEvidence } from "@/lib/presence";
import { listActiveOffices } from "@/lib/offices";
import { getPolicy } from "@/lib/policy";
import { matchNearestOffice } from "@/lib/visit-calculator";

const eventSchema = z.object({
  clientEventId: z.string().min(1).max(80).optional(),
  type: z.enum(["enter", "sample", "exit", "check_in", "check_out"]),
  at: z.string().datetime(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  accuracyMeters: z.number().optional().nullable(),
  wifiSsid: z.string().max(120).optional().nullable(),
  wifiBssid: z.string().max(64).optional().nullable(),
  simulated: z.boolean().optional(),
  officeLocationId: z.string().max(64).optional().nullable(),
  deviceName: z.string().max(80).optional().nullable(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
  deviceName: z.string().max(80).optional().nullable(),
});

export async function POST(request: Request) {
  const started = Date.now();
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;
  const { user, device } = actor;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const bodyLabel = cleanDeviceLabel(parsed.data.deviceName);
  if (device && bodyLabel && bodyLabel !== device.label) {
    await prisma.deviceToken.update({ where: { id: device.id }, data: { label: bodyLabel } });
  }
  const deviceName = bodyLabel ?? device?.label ?? (actor.viewAs ? "View as" : null);

  const [offices, rules] = await Promise.all([listActiveOffices(), getPolicy()]);
  const activeIds = new Set(offices.map((o) => o.id));

  let accepted = 0;
  for (const ev of parsed.data.events) {
    let officeLocationId =
      ev.officeLocationId && activeIds.has(ev.officeLocationId) ? ev.officeLocationId : null;
    if (!officeLocationId && ev.lat != null && ev.lng != null) {
      officeLocationId = matchNearestOffice(ev.lat, ev.lng, ev.accuracyMeters, offices, rules)?.id ?? null;
    }
    try {
      await prisma.presenceEvent.create({
        data: {
          userId: user.id,
          type: ev.type,
          recordedAt: new Date(ev.at),
          latitude: ev.lat ?? null,
          longitude: ev.lng ?? null,
          accuracyMeters: ev.accuracyMeters ?? null,
          wifiSsid: ev.wifiSsid ?? null,
          wifiBssid: ev.wifiBssid ?? null,
          simulated: ev.simulated ?? false,
          clientEventId: ev.clientEventId ?? null,
          deviceTokenId: device?.id ?? null,
          deviceName: cleanDeviceLabel(ev.deviceName) ?? deviceName,
          officeLocationId,
        },
      });
      accepted += 1;
    } catch {
      // duplicate clientEventId - ignore
    }
  }

  // Sample-only batches: persist + light status. Full month rewrite on enter/exit/check.
  const needsFullRecompute = parsed.data.events.some((e) => e.type !== "sample");
  const s = needsFullRecompute
    ? await recomputeUserPresence(user.id, { flushAlerts: true })
    : await touchStatusFromLatestEvidence(user.id);

  recordApiActivity({
    userId: user.id,
    deviceTokenId: device?.id,
    method: "POST",
    path: "/api/ingest",
    statusCode: 200,
    durationMs: Date.now() - started,
    note: needsFullRecompute ? "recomputed" : "light",
    throttle: false,
  });

  return NextResponse.json({
    ok: true,
    accepted,
    light: !needsFullRecompute,
    inOffice: s.inOffice,
    sinceAt: s.sinceAt?.toISOString() ?? null,
    officeLocationId: s.officeLocationId,
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
    dayMet: s.targetMet,
  });
}
