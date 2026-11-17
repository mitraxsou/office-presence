import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { clearLeaveDay, parseLeaveKind, setLeaveDay } from "@/lib/leave";

async function admin() {
  try {
    return await requireAdmin();
  } catch (res) {
    return res as Response;
  }
}

export async function PUT(request: Request, ctx: { params: Promise<{ userId: string; date: string }> }) {
  const a = await admin();
  if (a instanceof Response) return a;
  const { userId, date } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = parseLeaveKind(body.kind ?? "leave");
  if (!kind) return NextResponse.json({ error: "kind must be leave or other_duty" }, { status: 400 });
  const result = await setLeaveDay({
    actorId: a.id,
    userId,
    dayKey: date,
    kind,
    note: typeof body.note === "string" ? body.note : null,
    source: "admin",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, leave: result.leave });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ userId: string; date: string }> }) {
  const a = await admin();
  if (a instanceof Response) return a;
  const { userId, date } = await ctx.params;
  const result = await clearLeaveDay({ actorId: a.id, userId, dayKey: date, source: "admin" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, removed: result.removed });
}
