import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assertNotSelfEdit, putPersonDay, type AdminVisitInput } from "@/lib/admin-day-edits";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ userId: string; date: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const { userId, date } = await ctx.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const gate = await assertNotSelfEdit(admin.id, userId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "reason required" }, { status: 400 });
  const counted = body.counted !== false;
  const notify = body.notify !== false;
  const rawVisits = Array.isArray(body.visits) ? body.visits : [];
  const visits: AdminVisitInput[] = rawVisits.map((v: Record<string, unknown>) => ({
    id: v.id != null ? String(v.id) : undefined,
    office_id: v.office_id != null ? String(v.office_id) : v.officeLocationId != null ? String(v.officeLocationId) : null,
    in_at: String(v.in_at ?? v.startAt ?? ""),
    out_at: String(v.out_at ?? v.endAt ?? ""),
  }));

  const result = await putPersonDay({
    adminId: admin.id,
    userId,
    dayKey: date,
    visits,
    counted,
    reason,
    notify,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    day: result.day,
    monthPoints: result.monthPoints,
    pointsTarget: result.pointsTarget,
    pendingClosed: result.pendingClosed,
    effect: { days_before: result.daysBefore, days_after: result.daysAfter },
  });
}
