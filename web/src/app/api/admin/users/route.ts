import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";
import { composeFullName, parseColleagueDisplayMode } from "@/lib/display-name";
import { clampName, validateAdminUserEmail } from "@/lib/users-admin";
import type { Prisma, Role } from "@prisma/client";

const DUMMY_SEED = [
  { email: "dummy.in@example.pwc.local", name: "Demo In Office", inOffice: true },
  { email: "dummy.out@example.pwc.local", name: "Demo Out", inOffice: false },
  { email: "dummy.lobby@example.pwc.local", name: "Demo Lobby", inOffice: true },
];

function isDummyEmail(email: string) {
  return email.toLowerCase().endsWith("@example.pwc.local") || email.toLowerCase().startsWith("dummy.");
}

function listSelect() {
  return {
    id: true,
    email: true,
    name: true,
    firstName: true,
    lastName: true,
    preferredName: true,
    colleagueDisplayMode: true,
    role: true,
    isDummy: true,
    isTestAccount: true,
    deactivatedAt: true,
    homeOfficeId: true,
    homeOffice: { select: { id: true, name: true } },
    sharePresenceWithPeers: true,
    createdAt: true,
    deviceTokens: {
      where: { revokedAt: null },
      select: { id: true, label: true, platform: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" as const },
    },
    status: {
      select: {
        inOffice: true,
        sinceAt: true,
        officeName: true,
        officeLocationId: true,
        monthPoints: true,
        lastDeviceName: true,
        lastEvidenceAt: true,
      },
    },
  } satisfies Prisma.UserSelect;
}

export async function GET(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;

  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const roleRaw = (sp.get("role") ?? "").trim().toLowerCase();
  const office = (sp.get("office") ?? "").trim();
  const statusRaw = (sp.get("status") ?? "active").trim().toLowerCase();
  const status = statusRaw === "deactivated" || statusRaw === "all" || statusRaw === "active" ? statusRaw : "active";
  const includeTest =
    sp.get("includeTest") === "1" ||
    sp.get("includeTest") === "true" ||
    sp.get("includeTest") === "yes";

  const where: Prisma.UserWhereInput = {};

  if (status === "active") where.deactivatedAt = null;
  else if (status === "deactivated") where.deactivatedAt = { not: null };

  if (!includeTest) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { isTestAccount: false }, { isDummy: false }];
  }

  if (roleRaw === "admin" || roleRaw === "user") {
    where.role = roleRaw;
  }

  if (office) {
    where.homeOfficeId = office;
  }

  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { preferredName: { contains: q, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ isTestAccount: "desc" }, { email: "asc" }],
    select: listSelect(),
  });

  return NextResponse.json({
    users: users.map((u) => {
      const lastSeenAt =
        u.deviceTokens.find((d) => d.lastSeenAt)?.lastSeenAt?.toISOString() ??
        u.status?.lastEvidenceAt?.toISOString() ??
        null;
      return {
        ...u,
        phones: u.deviceTokens,
        lastSeenAt,
        statusLabel: u.deactivatedAt ? "deactivated" : "active",
      };
    }),
  });
}

export async function POST(request: Request) {
  const actor = await requireRealAdminActor(request);
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
          isTestAccount: true,
          sharePresenceWithPeers: true,
          sharePresenceConsentAt: new Date(),
        },
        update: {
          isDummy: true,
          isTestAccount: true,
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
    if (!user.isDummy && !user.isTestAccount && !isDummyEmail(user.email)) {
      return NextResponse.json(
        { error: "Simulate presence is only allowed for test accounts" },
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

  const wantTest =
    body.isTestAccount === true || body.isDummy === true || isDummyEmail(String(body.email ?? ""));
  const emailCheck = validateAdminUserEmail(String(body.email ?? ""), { allowTestDomain: wantTest });
  if (!emailCheck.ok) {
    return NextResponse.json({ error: emailCheck.error }, { status: 400 });
  }
  const email = emailCheck.email;

  const firstName = clampName(body.firstName, 40);
  const lastName = clampName(body.lastName, 40);
  const preferredName = clampName(body.preferredName, 30);
  const legacyName =
    body.name != null ? clampName(body.name, 120) : composeFullName(firstName, lastName);
  const role = (body.role === "admin" ? "admin" : "user") as Role;
  const isTestAccount = wantTest || isDummyEmail(email);
  const homeOfficeId = body.homeOfficeId != null && body.homeOfficeId !== "" ? String(body.homeOfficeId) : null;
  const colleagueDisplayMode = parseColleagueDisplayMode(body.colleagueDisplayMode);
  const share = isTestAccount || body.sharePresenceWithPeers === true;

  if (homeOfficeId) {
    const office = await prisma.officeLocation.findUnique({ where: { id: homeOfficeId } });
    if (!office) return NextResponse.json({ error: "Home office not found" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "Email already exists", id: existing.id }, { status: 409 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: legacyName,
        firstName,
        lastName,
        preferredName,
        colleagueDisplayMode,
        role,
        homeOfficeId,
        isDummy: isTestAccount,
        isTestAccount,
        sharePresenceWithPeers: share,
        sharePresenceConsentAt: share ? new Date() : null,
      },
      select: listSelect(),
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }
}

/** Legacy query-param delete; prefer DELETE /api/admin/users/[id] with confirmEmail. */
export async function DELETE(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === actor.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "admin") {
    const others = await prisma.user.count({
      where: { role: "admin", deactivatedAt: null, id: { not: id } },
    });
    if (others < 1) {
      return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 });
    }
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
