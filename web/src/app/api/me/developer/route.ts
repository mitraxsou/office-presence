import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";
import { reverseGeocode } from "@/lib/offices";

export async function PATCH(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const enabled = body.developerMode === true;
  if (enabled && body.confirm !== true) {
    return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
  }
  const user = await prisma.user.update({
    where: { id: actor.user.id },
    data: { developerMode: enabled },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: enabled ? "developer.on" : "developer.off",
      targetType: "User",
      targetId: actor.user.id,
    },
  });
  return NextResponse.json({ developerMode: user.developerMode });
}

/** Developer tools: suggest_office creates a pending OfficeLocation for admin review. */
export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  if (!actor.user.developerMode) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (body.action !== "suggest_office") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 80);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const radiusMeters = Number(body.radiusMeters ?? 100);
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "name, latitude, longitude required" }, { status: 400 });
  }
  const office = await prisma.officeLocation.create({
    data: {
      name,
      latitude,
      longitude,
      radiusMeters: Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 100,
      pointsPerVisitDay: 1,
      addressLabel: await reverseGeocode(latitude, longitude),
      status: "pending",
      createdByUserId: actor.user.id,
    },
  });
  await prisma.auditLog.create({
    data: { actorId: actor.user.id, action: "office.suggest", targetType: "OfficeLocation", targetId: office.id, afterJson: office },
  });
  return NextResponse.json({ office });
}
