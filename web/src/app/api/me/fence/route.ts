import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";
import { reverseGeocode } from "@/lib/offices";

/**
 * Legacy "Set office here" from older phone builds. Admins create an active
 * office; everyone else creates a pending suggestion for admin review.
 */
export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const radiusMeters = Number(body.radiusMeters ?? 100);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "latitude and longitude required" }, { status: 400 });
  }
  const isAdmin = actor.user.role === "admin";
  const office = await prisma.officeLocation.create({
    data: {
      name: name || "Office",
      latitude,
      longitude,
      radiusMeters: Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 100,
      pointsPerVisitDay: 1,
      addressLabel: await reverseGeocode(latitude, longitude),
      status: isAdmin ? "active" : "pending",
      createdByUserId: actor.user.id,
      ...(isAdmin ? { approvedByAdminId: actor.user.id, approvedAt: new Date() } : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: isAdmin ? "office.create" : "office.suggest",
      targetType: "OfficeLocation",
      targetId: office.id,
      afterJson: office,
    },
  });
  return NextResponse.json({ office, pending: !isAdmin });
}
