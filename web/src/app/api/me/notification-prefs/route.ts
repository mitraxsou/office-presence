import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
import { parseQuietCustomDays, parseQuietHours, parseQuietHoursDays } from "@/lib/users-admin";

const TONE_KEYS = ["default", "chime", "pulse", "soft"] as const;

function tone(v: unknown, fallback: string) {
  const s = String(v ?? fallback);
  return (TONE_KEYS as readonly string[]).includes(s) ? s : fallback;
}

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const prefs = await prisma.userNotificationPrefs.upsert({
    where: { userId: actor.user.id },
    create: { userId: actor.user.id },
    update: {},
  });
  return NextResponse.json({ prefs });
}

export async function PATCH(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;

  const body = await request.json();
  const enter =
    body.notifyOfficeEnter != null
      ? !!body.notifyOfficeEnter
      : body.notifyOfficeDetected != null
        ? !!body.notifyOfficeDetected
        : undefined;
  const leave =
    body.notifyOfficeLeave != null
      ? !!body.notifyOfficeLeave
      : body.notifyOfficeDetected != null
        ? !!body.notifyOfficeDetected
        : undefined;

  const quietStart = parseQuietHours(body.quietHoursStart);
  const quietEnd = parseQuietHours(body.quietHoursEnd);
  if (body.quietHoursStart !== undefined && quietStart === undefined) {
    return NextResponse.json({ error: "quietHoursStart must be HH:MM" }, { status: 400 });
  }
  if (body.quietHoursEnd !== undefined && quietEnd === undefined) {
    return NextResponse.json({ error: "quietHoursEnd must be HH:MM" }, { status: 400 });
  }
  const quietDays = parseQuietHoursDays(body.quietHoursDays);
  if (body.quietHoursDays !== undefined && quietDays === undefined) {
    return NextResponse.json({ error: "quietHoursDays must be all, weekdays, or custom" }, { status: 400 });
  }
  const quietCustom = parseQuietCustomDays(body.quietHoursCustomDays);
  if (body.quietHoursCustomDays !== undefined && quietCustom === undefined) {
    return NextResponse.json(
      { error: "quietHoursCustomDays must list weekdays 1 to 7" },
      { status: 400 },
    );
  }

  const prefs = await prisma.userNotificationPrefs.upsert({
    where: { userId: actor.user.id },
    create: {
      userId: actor.user.id,
      notifyOfficeDetected: body.notifyOfficeDetected ?? true,
      notifyOfficeEnter: enter ?? true,
      notifyOfficeLeave: leave ?? true,
      notifyGoalMet: body.notifyGoalMet ?? true,
      notifyDailySummary: body.notifyDailySummary ?? true,
      notifyCorrections: body.notifyCorrections ?? true,
      notifyTrackingProblems: body.notifyTrackingProblems ?? true,
      quietHoursStart: quietStart ?? null,
      quietHoursEnd: quietEnd ?? null,
      quietHoursDays: quietDays ?? "all",
      quietHoursCustomDays: quietCustom ?? "1,2,3,4,5",
      quietAlertTracking: body.quietAlertTracking ?? true,
      quietAlertCorrections: body.quietAlertCorrections ?? false,
      notificationToneId: tone(body.notificationToneId, "default"),
      toneEnterId: tone(body.toneEnterId, "chime"),
      toneLeaveId: tone(body.toneLeaveId, "soft"),
      toneGoalId: tone(body.toneGoalId, "pulse"),
      toneSummaryId: tone(body.toneSummaryId, "default"),
      launchSoundEnabled: body.launchSoundEnabled ?? false,
      launchSoundId: tone(body.launchSoundId, "default"),
    },
    update: {
      ...(body.notifyOfficeDetected != null ? { notifyOfficeDetected: !!body.notifyOfficeDetected } : {}),
      ...(enter != null ? { notifyOfficeEnter: enter } : {}),
      ...(leave != null ? { notifyOfficeLeave: leave } : {}),
      ...(body.notifyGoalMet != null ? { notifyGoalMet: !!body.notifyGoalMet } : {}),
      ...(body.notifyDailySummary != null ? { notifyDailySummary: !!body.notifyDailySummary } : {}),
      ...(body.notifyCorrections != null ? { notifyCorrections: !!body.notifyCorrections } : {}),
      ...(body.notifyTrackingProblems != null
        ? { notifyTrackingProblems: !!body.notifyTrackingProblems }
        : {}),
      ...(body.quietHoursStart !== undefined ? { quietHoursStart: quietStart ?? null } : {}),
      ...(body.quietHoursEnd !== undefined ? { quietHoursEnd: quietEnd ?? null } : {}),
      ...(quietDays != null ? { quietHoursDays: quietDays } : {}),
      ...(quietCustom != null ? { quietHoursCustomDays: quietCustom } : {}),
      ...(body.quietAlertTracking != null ? { quietAlertTracking: !!body.quietAlertTracking } : {}),
      ...(body.quietAlertCorrections != null ? { quietAlertCorrections: !!body.quietAlertCorrections } : {}),
      ...(body.notificationToneId != null ? { notificationToneId: tone(body.notificationToneId, "default") } : {}),
      ...(body.toneEnterId != null ? { toneEnterId: tone(body.toneEnterId, "chime") } : {}),
      ...(body.toneLeaveId != null ? { toneLeaveId: tone(body.toneLeaveId, "soft") } : {}),
      ...(body.toneGoalId != null ? { toneGoalId: tone(body.toneGoalId, "pulse") } : {}),
      ...(body.toneSummaryId != null ? { toneSummaryId: tone(body.toneSummaryId, "default") } : {}),
      ...(body.launchSoundEnabled != null ? { launchSoundEnabled: !!body.launchSoundEnabled } : {}),
      ...(body.launchSoundId != null ? { launchSoundId: tone(body.launchSoundId, "default") } : {}),
    },
  });
  return NextResponse.json({ prefs });
}
