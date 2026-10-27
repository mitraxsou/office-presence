import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addPersonVisit, assertNotSelfEdit } from "@/lib/admin-day-edits";
import { dayKeyInTz } from "@/lib/visit-calculator";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const { userId } = await ctx.params;
  const gate = await assertNotSelfEdit(admin.id, userId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "reason required" }, { status: 400 });
  const inAt = String(body.in_at ?? body.startAt ?? "");
  const outAt = String(body.out_at ?? body.endAt ?? "");
  const officeId =
    body.office_id != null
      ? String(body.office_id)
      : body.officeLocationId != null
        ? String(body.officeLocationId)
        : null;
  const notify = body.notify !== false;

  let dayKey = String(body.day ?? body.dayKey ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const tz = user?.timezone || "Asia/Kolkata";
    const parsed = new Date(inAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "day or in_at required" }, { status: 400 });
    }
    dayKey = dayKeyInTz(parsed, tz);
  }

  const result = await addPersonVisit({
    adminId: admin.id,
    userId,
    dayKey,
    office_id: officeId,
    in_at: inAt,
    out_at: outAt,
    reason,
    notify,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    day: result.day,
    monthPoints: result.monthPoints,
    pointsTarget: result.pointsTarget,
    effect: { days_before: result.daysBefore, days_after: result.daysAfter },
  });
}
