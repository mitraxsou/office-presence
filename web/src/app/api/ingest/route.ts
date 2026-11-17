import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import { cleanDeviceLabel } from "@/lib/otp";
import { recomputeUserPresence, touchStatusFromLatestEvidence } from "@/lib/presence";
import { listActiveOffices } from "@/lib/offices";
import { getPolicy } from "@/lib/policy";
import { CHECK_OUT_PAIR_WINDOW_MS, checkInEvidenceWindowMs, decideTrust } from "@/lib/ingest-trust";
import { hasCurrentConsent } from "@/lib/consent";

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
  mock: z.boolean().optional(),
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
  if (!device && actor.viewAs?.mode !== "full") {
    return NextResponse.json({ error: "Only the phone app can send presence" }, { status: 403 });
  }
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
  if (!hasCurrentConsent(user, rules)) {
    return NextResponse.json({ error: "consent_required" }, { status: 403 });
  }
  const pointsById = new Map(offices.map((o) => [o.id, o.pointsPerVisitDay ?? 1]));

  const nowMs = Date.now();
  const rejectMock = rules.rejectMockLocations !== false && !user.isTestAccount && !user.isDummy;
  const events = [...parsed.data.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const checkOutTimes = new Set(
    events.filter((e) => e.type === "check_out").map((e) => Date.parse(e.at)),
  );
  const insideEvidence: { officeLocationId: string; atMs: number }[] = [];
  const checkIns = events.filter((e) => e.type === "check_in").map((e) => Date.parse(e.at));
  if (checkIns.length > 0) {
    const windowMs = checkInEvidenceWindowMs(rules);
    const [stored, storedOuts] = await Promise.all([
      prisma.presenceEvent.findMany({
        where: {
          userId: user.id,
          trusted: true,
          simulated: false,
          type: { in: ["enter", "sample", "check_in"] },
          officeLocationId: { not: null },
          recordedAt: {
            gte: new Date(Math.min(...checkIns) - windowMs),
            lte: new Date(Math.max(...checkIns)),
          },
        },
        select: { officeLocationId: true, recordedAt: true },
      }),
      prisma.presenceEvent.findMany({
        where: {
          userId: user.id,
          type: "check_out",
          recordedAt: { in: checkIns.map((t) => new Date(t)) },
          createdAt: { gte: new Date(nowMs - CHECK_OUT_PAIR_WINDOW_MS) },
        },
        select: { recordedAt: true },
      }),
    ]);
    for (const s of stored) {
      if (s.officeLocationId) insideEvidence.push({ officeLocationId: s.officeLocationId, atMs: s.recordedAt.getTime() });
    }
    for (const s of storedOuts) checkOutTimes.add(s.recordedAt.getTime());
  }

  let accepted = 0;
  let rejected = 0;
  const rejectedReasons: Record<string, number> = {};
  for (const ev of events) {
    const atMs = Date.parse(ev.at);
    const decision = decideTrust(
      {
        type: ev.type,
        atMs,
        lat: ev.lat,
        lng: ev.lng,
        accuracyMeters: ev.accuracyMeters,
        officeLocationId: ev.officeLocationId,
        mock: ev.mock === true,
      },
      { nowMs, fromDevice: device != null, offices, rules, checkOutTimes, insideEvidence, rejectMock },
    );
    if (decision.skip) {
      rejected += 1;
      rejectedReasons[decision.reason] = (rejectedReasons[decision.reason] ?? 0) + 1;
      continue;
    }
    const { officeLocationId, trusted, rejectReason } = decision;
    if (!trusted && rejectReason) {
      rejected += 1;
      rejectedReasons[rejectReason] = (rejectedReasons[rejectReason] ?? 0) + 1;
    }
    if (
      trusted &&
      officeLocationId &&
      !ev.simulated &&
      (ev.type === "enter" || ev.type === "sample" || ev.type === "check_in")
    ) {
      insideEvidence.push({ officeLocationId, atMs });
    }
    // Store the least location data: coordinates and Wi-Fi only for fixes inside an office.
    const keepPlace = officeLocationId != null;
    try {
      await prisma.presenceEvent.create({
        data: {
          userId: user.id,
          type: ev.type,
          recordedAt: new Date(ev.at),
          latitude: keepPlace ? ev.lat ?? null : null,
          longitude: keepPlace ? ev.lng ?? null : null,
          accuracyMeters: ev.accuracyMeters ?? null,
          wifiSsid: keepPlace ? ev.wifiSsid ?? null : null,
          wifiBssid: keepPlace ? ev.wifiBssid ?? null : null,
          simulated: ev.simulated ?? false,
          mockLocation: ev.mock === true,
          clientEventId: ev.clientEventId ?? null,
          deviceTokenId: device?.id ?? null,
          deviceName: cleanDeviceLabel(ev.deviceName) ?? deviceName,
          officeLocationId,
          pointsAtMatch: officeLocationId ? pointsById.get(officeLocationId) ?? null : null,
          trusted,
          rejectReason,
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
    ? await recomputeUserPresence(user.id, { flushAlerts: !actor.viewAs })
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
    rejected,
    rejectedReasons,
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
