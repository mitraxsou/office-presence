import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireRealAdminActor } from "@/lib/actor";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { computeUserMonth, monthKeyInTz } from "@/lib/presence";

const MIN_REASON = 10;

function lastMonthKeys(now: Date, timezone: string, count: number): string[] {
  const [y, m] = monthKeyInTz(now, timezone).split("-").map(Number);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Reset one person's presence data. Test accounts always; real accounts only with ALLOW_REAL_USER_RESET=1. */
export async function POST(request: Request) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const effective = await getSession();
  if (effective?.viewAsSessionId) {
    return NextResponse.json({ error: "End view as before resetting data." }, { status: 403 });
  }
  const admin = actor.user;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < MIN_REASON) {
    return NextResponse.json(
      { error: `Reason must be at least ${MIN_REASON} characters` },
      { status: 400 },
    );
  }
  if (userId === admin.id) {
    return NextResponse.json({ error: "You cannot reset your own data." }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const confirm = typeof body.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
  if (confirm !== target.email.toLowerCase()) {
    return NextResponse.json({ error: "Type the person's email to confirm" }, { status: 400 });
  }

  const isTest = target.isTestAccount || target.isDummy;
  if (!isTest && process.env.ALLOW_REAL_USER_RESET !== "1") {
    return NextResponse.json(
      { error: "Real accounts cannot be reset here. Only test accounts can be reset." },
      { status: 403 },
    );
  }

  const policy = await getPolicy();
  const months: { monthKey: string; points: number; visitDays: number }[] = [];
  for (const key of lastMonthKeys(new Date(), policy.timezone, 3)) {
    try {
      const m = await computeUserMonth(userId, key);
      months.push({ monthKey: key, points: m.summary.points, visitDays: m.summary.visitDays });
    } catch {
      months.push({ monthKey: key, points: 0, visitDays: 0 });
    }
  }

  const where = { userId };
  const [events, visits, exclusions, alerts, statuses] = await Promise.all([
    prisma.presenceEvent.count({ where }),
    prisma.visit.count({ where }),
    prisma.visitExclusion.count({ where }),
    prisma.pendingAlert.count({ where }),
    prisma.currentStatus.count({ where }),
  ]);
  const counts = { events, visits, exclusions, alerts, statuses };

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "presence.reset",
      targetType: "user",
      targetId: userId,
      beforeJson: { counts, months, testAccount: isTest },
      reason,
    },
  });

  const [dEvents, dVisits, dExclusions, dAlerts, dStatuses] = await prisma.$transaction([
    prisma.presenceEvent.deleteMany({ where }),
    prisma.visit.deleteMany({ where }),
    prisma.visitExclusion.deleteMany({ where }),
    prisma.pendingAlert.deleteMany({ where }),
    prisma.currentStatus.deleteMany({ where }),
  ]);

  return NextResponse.json({
    ok: true,
    deleted: {
      events: dEvents.count,
      visits: dVisits.count,
      exclusions: dExclusions.count,
      alerts: dAlerts.count,
      statuses: dStatuses.count,
    },
  });
}
