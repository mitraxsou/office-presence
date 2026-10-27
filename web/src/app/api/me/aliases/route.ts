import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";

/** Personal office aliases. Admin names stay unchanged for everyone else. */
export async function PUT(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const officeLocationId = String(body.officeLocationId ?? "");
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 60) : "";
  if (!officeLocationId) return NextResponse.json({ error: "officeLocationId required" }, { status: 400 });
  const office = await prisma.officeLocation.findUnique({ where: { id: officeLocationId } });
  if (!office) return NextResponse.json({ error: "Office not found" }, { status: 404 });
  const where = { userId_officeLocationId: { userId: actor.user.id, officeLocationId } };
  if (!displayName) {
    await prisma.userOfficeAlias.deleteMany({ where: { userId: actor.user.id, officeLocationId } });
    return NextResponse.json({ alias: null });
  }
  const alias = await prisma.userOfficeAlias.upsert({
    where,
    create: { userId: actor.user.id, officeLocationId, displayName },
    update: { displayName },
  });
  return NextResponse.json({ alias });
}
