import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import { maybeNotifyDeviceUpdate } from "@/lib/firebase-admin";
import { cleanDeviceLabel } from "@/lib/otp";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const devices = await prisma.deviceToken.findMany({
    where: { userId: actor.user.id, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, label: true, platform: true, lastSeenAt: true, createdAt: true },
  });
  return NextResponse.json({
    devices: devices.map((d) => ({ ...d, current: d.id === actor.device?.id })),
  });
}

export async function PATCH(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? actor.device?.id ?? "");
  const fcmToken = typeof body.fcmToken === "string" ? body.fcmToken.trim().slice(0, 4096) : "";
  const versionRaw = body.appVersionCode;
  const appVersionCode =
    typeof versionRaw === "number"
      ? Math.max(0, Math.floor(versionRaw))
      : typeof versionRaw === "string" && versionRaw.trim() !== "" && Number.isFinite(Number(versionRaw))
        ? Math.max(0, Math.floor(Number(versionRaw)))
        : null;
  const labelRaw = body.label;
  const label = labelRaw === undefined || labelRaw === null ? null : cleanDeviceLabel(labelRaw);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!fcmToken && !label && appVersionCode == null) {
    return NextResponse.json({ error: "label or fcmToken required" }, { status: 400 });
  }
  const row = await prisma.deviceToken.findFirst({ where: { id, userId: actor.user.id, revokedAt: null } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const device = await prisma.deviceToken.update({
    where: { id },
    data: {
      ...(label ? { label } : {}),
      ...(fcmToken ? { fcmToken } : {}),
      ...(appVersionCode != null ? { appVersionCode } : {}),
    },
  });
  recordApiActivity({
    userId: actor.user.id,
    deviceTokenId: actor.device?.id,
    method: "PATCH",
    path: "/api/me/devices",
    statusCode: 200,
    note: fcmToken ? "fcmToken" : appVersionCode != null ? "appVersion" : "label",
    throttle: false,
  });
  if (fcmToken || appVersionCode != null) {
    try {
      await maybeNotifyDeviceUpdate(device.id);
    } catch (e) {
      console.warn("[devices] app update push failed", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({
    device: { id: device.id, label: device.label, fcmRegistered: Boolean(device.fcmToken) },
  });
}

export async function DELETE(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? new URL(request.url).searchParams.get("id") ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const row = await prisma.deviceToken.findFirst({ where: { id, userId: actor.user.id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.deviceToken.update({ where: { id }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({
    data: { actorId: actor.user.id, action: "device.revoke", targetType: "DeviceToken", targetId: id },
  });
  recordApiActivity({
    userId: actor.user.id,
    deviceTokenId: actor.device?.id,
    method: "DELETE",
    path: "/api/me/devices",
    statusCode: 200,
    note: "revoke",
    throttle: false,
  });
  return NextResponse.json({ ok: true });
}
