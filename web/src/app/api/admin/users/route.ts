import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminActor } from "@/lib/actor";
import type { Role } from "@prisma/client";

const DUMMY_SEED = [
  { email: "dummy.in@example.pwc.local", name: "Demo In Office", inOffice: true },
  { email: "dummy.out@example.pwc.local", name: "Demo Out", inOffice: false },
  { email: "dummy.lobby@example.pwc.local", name: "Demo Lobby", inOffice: true },
];

function isDummyEmail(email: string) {
  return email.toLowerCase().endsWith("@example.pwc.local") || email.toLowerCase().startsWith("dummy.");
}

export async function GET(request: Request) {
  const actor = await requireAdminActor(request);
  if (actor instanceof Response) return actor;
  const users = await prisma.user.findMany({
    orderBy: [{ isDummy: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isDummy: true,
      sharePresenceWithPeers: true,
      status: {
        select: {
          inOffice: true,
          sinceAt: true,
          officeName: true,
          officeLocationId: true,
          monthPoints: true,
          lastDeviceName: true,
        },
      },
    },
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const actor = await requireAdminActor(request);
  if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => ({}));

  if (body.seedDummies === true) {
    const office = await prisma.officeLocation.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "asc" },
    });
    const created: string[] = [];
    for (const d of DUMMY_SEED) {
      const user = await prisma.user.upsert({
        where: { email: d.email },
        create: {
          email: d.email,
          name: d.name,
          role: "user",
          isDummy: true,
          sharePresenceWithPeers: true,
          sharePresenceConsentAt: new Date(),
        },
        update: {
          isDummy: true,
          sharePresenceWithPeers: true,
          sharePresenceConsentAt: new Date(),
          name: d.name,
        },
      });
      await prisma.currentStatus.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          inOffice: d.inOffice,
          sinceAt: d.inOffice ? new Date() : null,
          officeLocationId: d.inOffice ? office?.id ?? null : null,
          officeName: d.inOffice ? office?.name ?? "Demo office" : null,
          hoursToday: d.inOffice ? 1.5 : 0,
          pointsToday: d.inOffice ? office?.pointsPerVisitDay ?? 1 : 0,
          monthPoints: d.inOffice ? office?.pointsPerVisitDay ?? 1 : 0,
          monthVisitDays: d.inOffice ? 1 : 0,
          monthDays: d.inOffice ? 1 : 0,
          lastDeviceName: "Demo phone",
          lastEvidenceAt: new Date(),
        },
        update: {
          inOffice: d.inOffice,
          sinceAt: d.inOffice ? new Date() : null,
          officeLocationId: d.inOffice ? office?.id ?? null : null,
          officeName: d.inOffice ? office?.name ?? "Demo office" : null,
          lastDeviceName: "Demo phone",
          lastEvidenceAt: new Date(),
        },
      });
      created.push(user.email);
    }
    return NextResponse.json({ ok: true, seeded: created });
  }

  if (body.action === "simulate") {
    const userId = String(body.userId ?? "");
    const inOffice = !!body.inOffice;
    const officeLocationId = body.officeLocationId ? String(body.officeLocationId) : null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.isDummy && !isDummyEmail(user.email)) {
      return NextResponse.json(
        { error: "Simulate presence is only allowed for dummy users" },
        { status: 400 },
      );
    }
    let officeName: string | null = null;
    let officeId: string | null = null;
    if (inOffice) {
      const office = officeLocationId
        ? await prisma.officeLocation.findUnique({ where: { id: officeLocationId } })
        : await prisma.officeLocation.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
      if (!office) return NextResponse.json({ error: "No active office to assign" }, { status: 400 });
      officeId = office.id;
      officeName = office.name;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { sharePresenceWithPeers: true, sharePresenceConsentAt: new Date() },
    });
    await prisma.currentStatus.upsert({
      where: { userId },
      create: {
        userId,
        inOffice,
        sinceAt: inOffice ? new Date() : null,
        officeLocationId: officeId,
        officeName,
        hoursToday: inOffice ? 1 : 0,
        pointsToday: inOffice ? 1 : 0,
        monthPoints: inOffice ? 1 : 0,
        monthVisitDays: inOffice ? 1 : 0,
        monthDays: inOffice ? 1 : 0,
        lastDeviceName: "Demo phone",
        lastEvidenceAt: new Date(),
      },
      update: {
        inOffice,
        sinceAt: inOffice ? new Date() : null,
        officeLocationId: officeId,
        officeName,
        lastDeviceName: "Demo phone",
        lastEvidenceAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, userId, inOffice, officeName });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const name = body.name != null ? String(body.name).trim().slice(0, 120) : null;
  const role = (body.role === "admin" ? "admin" : "user") as Role;
  const isDummy = body.isDummy === true || isDummyEmail(email);
  const share = isDummy || body.sharePresenceWithPeers === true;
  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        role,
        isDummy,
        sharePresenceWithPeers: share,
        sharePresenceConsentAt: share ? new Date() : null,
      },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const actor = await requireAdminActor(request);
  if (actor instanceof Response) return actor;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === actor.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
