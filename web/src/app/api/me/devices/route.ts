import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
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
  const label = cleanDeviceLabel(body.label);
  if (!id || !label) return NextResponse.json({ error: "id and label required" }, { status: 400 });
  const row = await prisma.deviceToken.findFirst({ where: { id, userId: actor.user.id, revokedAt: null } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const device = await prisma.deviceToken.update({ where: { id }, data: { label } });
  return NextResponse.json({ device: { id: device.id, label: device.label } });
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
  return NextResponse.json({ ok: true });
}
