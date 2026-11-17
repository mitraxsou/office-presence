import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireExceptionGranter } from "@/lib/actor";
import { grantException, monthDayRange, type ExceptionKind } from "@/lib/exceptions";
import { displayName } from "@/lib/display-name";

const nameSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  email: true,
  colleagueDisplayMode: true,
} as const;

export async function GET(request: Request) {
  const actor = await requireExceptionGranter(request);
  if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const officeId = url.searchParams.get("office");
  const status = url.searchParams.get("status") ?? "active";
  const userId = url.searchParams.get("userId");

  const where: Prisma.PresenceExceptionWhereInput = {};
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const { startDay, endDay } = monthDayRange(month);
    where.startDay = { lte: endDay };
    where.endDay = { gte: startDay };
  }
  if (officeId) where.officeLocationId = officeId;
  if (status === "active") where.revokedAt = null;
  else if (status === "revoked") where.revokedAt = { not: null };
  if (userId) where.userId = userId;

  const rows = await prisma.presenceException.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      user: { select: { ...nameSelect, homeOfficeId: true } },
      _count: { select: { days: true } },
    },
  });
  const actorIds = [...new Set(rows.flatMap((r) => [r.grantedById, r.revokedById].filter(Boolean) as string[]))];
  const officeIds = [...new Set(rows.map((r) => r.officeLocationId))];
  const [actors, offices] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: nameSelect }),
    prisma.officeLocation.findMany({ where: { id: { in: officeIds } }, select: { id: true, name: true } }),
  ]);
  const actorName = new Map(actors.map((a) => [a.id, displayName(a)]));
  const officeName = new Map(offices.map((o) => [o.id, o.name]));

  return NextResponse.json({
    exceptions: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      personName: displayName(r.user),
      personEmail: r.user.email,
      kind: r.kind,
      startDay: r.startDay,
      endDay: r.endDay,
      officeLocationId: r.officeLocationId,
      officeName: officeName.get(r.officeLocationId) ?? "Office",
      pointsPerDay: r.pointsPerDay,
      days: r._count.days,
      totalPoints: r._count.days * r.pointsPerDay,
      reason: r.reason,
      reference: r.reference,
      grantedBy: actorName.get(r.grantedById) ?? null,
      createdAt: r.createdAt.toISOString(),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedBy: r.revokedById ? actorName.get(r.revokedById) ?? null : null,
      revokeReason: r.revokeReason,
    })),
  });
}

export async function POST(request: Request) {
  const actor = await requireExceptionGranter(request);
  if (actor instanceof Response) return actor;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === "month" ? "month" : body.kind === "days" ? "days" : null;
  if (!kind) return NextResponse.json({ error: "Choose single day, several days, or whole month" }, { status: 400 });
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "Choose a person" }, { status: 400 });
  const result = await grantException({
    actorId: actor.user.id,
    userId,
    kind: kind as ExceptionKind,
    startDay: typeof body.startDay === "string" ? body.startDay : undefined,
    endDay: typeof body.endDay === "string" ? body.endDay : undefined,
    monthKey: typeof body.monthKey === "string" ? body.monthKey : undefined,
    officeLocationId: typeof body.officeLocationId === "string" ? body.officeLocationId : null,
    reason: typeof body.reason === "string" ? body.reason : "",
    reference: typeof body.reference === "string" ? body.reference : null,
    confirmClosedMonth: body.confirmClosedMonth === true,
    closedMonthReason: typeof body.closedMonthReason === "string" ? body.closedMonthReason : null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...("lockedMonths" in result ? { lockedMonths: result.lockedMonths } : {}) },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, exception: { id: result.exception.id }, preview: result.preview });
}
