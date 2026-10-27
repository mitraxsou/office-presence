import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { prisma } from "@/lib/db";
import { searchPlaces } from "@/lib/offices";
import { getPolicy } from "@/lib/policy";

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  const address = String(body.address ?? "").trim().slice(0, 300);
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!address || address.length < 2) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const query = `${name}, ${address}`;
  const places = await searchPlaces(query, 3);
  const hit = places[0];
  if (!hit) {
    return NextResponse.json(
      { error: "Could not geocode that address. Try a fuller street address." },
      { status: 400 },
    );
  }

  const policy = await getPolicy();
  const office = await prisma.officeLocation.create({
    data: {
      name,
      latitude: hit.lat,
      longitude: hit.lng,
      radiusMeters: policy.fenceRadiusMeters ?? 100,
      pointsPerVisitDay: 1,
      addressLabel: hit.address || address,
      status: "pending",
      createdByUserId: actor.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: "office.suggest",
      targetType: "OfficeLocation",
      targetId: office.id,
      afterJson: {
        id: office.id,
        name: office.name,
        addressLabel: office.addressLabel,
        status: office.status,
      },
    },
  });

  return NextResponse.json({
    office: {
      id: office.id,
      name: office.name,
      addressLabel: office.addressLabel,
      status: office.status,
      radiusMeters: office.radiusMeters,
      pointsPerVisitDay: office.pointsPerVisitDay,
    },
  });
}
