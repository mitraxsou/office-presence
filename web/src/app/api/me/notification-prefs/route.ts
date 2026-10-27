import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authenticateDeviceToken } from "@/lib/otp";
import { prisma } from "@/lib/db";

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
  const prefs = await prisma.userNotificationPrefs.upsert({
    where: { userId: id },
    create: {
      userId: id,
      notifyOfficeDetected: body.notifyOfficeDetected ?? true,
      notifyGoalMet: body.notifyGoalMet ?? true,
      notifyDailySummary: body.notifyDailySummary ?? true,
      notificationToneId: body.notificationToneId ?? "default",
      launchSoundEnabled: body.launchSoundEnabled ?? false,
      launchSoundId: body.launchSoundId ?? "default",
    },
    update: {
      ...(body.notifyOfficeDetected != null ? { notifyOfficeDetected: !!body.notifyOfficeDetected } : {}),
      ...(body.notifyGoalMet != null ? { notifyGoalMet: !!body.notifyGoalMet } : {}),
      ...(body.notifyDailySummary != null ? { notifyDailySummary: !!body.notifyDailySummary } : {}),
      ...(body.notificationToneId != null ? { notificationToneId: String(body.notificationToneId) } : {}),
      ...(body.launchSoundEnabled != null ? { launchSoundEnabled: !!body.launchSoundEnabled } : {}),
      ...(body.launchSoundId != null ? { launchSoundId: String(body.launchSoundId) } : {}),
    },
  });
  return NextResponse.json({ prefs });
}
