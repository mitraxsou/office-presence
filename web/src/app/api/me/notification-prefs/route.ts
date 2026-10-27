import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authenticateDeviceToken } from "@/lib/otp";
import { prisma } from "@/lib/db";

const TONE_KEYS = ["default", "chime", "pulse", "soft"] as const;

function tone(v: unknown, fallback: string) {
  const s = String(v ?? fallback);
  return (TONE_KEYS as readonly string[]).includes(s) ? s : fallback;
}

async function userId(request: Request) {
  const session = await getSession();
  if (session) return session.id;
  const u = await authenticateDeviceToken(request.headers.get("authorization"));
  return u?.id ?? null;
}

export async function GET(request: Request) {
  const id = await userId(request);
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = await prisma.userNotificationPrefs.upsert({
    where: { userId: id },
    create: { userId: id },
    update: {},
  });
  return NextResponse.json({ prefs });
}

export async function PATCH(request: Request) {
  const id = await userId(request);
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const prefs = await prisma.userNotificationPrefs.upsert({
    where: { userId: id },
    create: {
      userId: id,
      notifyOfficeDetected: body.notifyOfficeDetected ?? true,
      notifyOfficeEnter: enter ?? true,
      notifyOfficeLeave: leave ?? true,
      notifyGoalMet: body.notifyGoalMet ?? true,
      notifyDailySummary: body.notifyDailySummary ?? true,
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
