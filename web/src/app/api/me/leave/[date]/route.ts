import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
import { clearLeaveDay, parseLeaveKind, selfLeaveError, setLeaveDay } from "@/lib/leave";

async function actorFor(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  return rejectIfReadonlyViewAs(actor) ?? actor;
}

export async function PUT(request: Request, ctx: { params: Promise<{ date: string }> }) {
  const actor = await actorFor(request);
  if (actor instanceof Response) return actor;
  const { date } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = parseLeaveKind(body.kind ?? "leave");
  if (!kind) return NextResponse.json({ error: "kind must be leave or other_duty" }, { status: 400 });
  const error = await selfLeaveError(actor.user, date);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const result = await setLeaveDay({
    actorId: actor.user.id,
    userId: actor.user.id,
    dayKey: date,
    kind,
    note: typeof body.note === "string" ? body.note : null,
    source: "self",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, leave: { dayKey: result.leave.dayKey, kind: result.leave.kind, note: result.leave.note } });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ date: string }> }) {
  const actor = await actorFor(request);
  if (actor instanceof Response) return actor;
  const { date } = await ctx.params;
  const error = await selfLeaveError(actor.user, date);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const existing = await prisma.leaveDay.findUnique({
    where: { userId_dayKey: { userId: actor.user.id, dayKey: date } },
    select: { source: true },
  });
  if (existing && existing.source !== "self") {
    return NextResponse.json({ error: "An admin marked this leave. Ask an admin to remove it." }, { status: 403 });
  }
  const result = await clearLeaveDay({ actorId: actor.user.id, userId: actor.user.id, dayKey: date, source: "self" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, removed: result.removed });
}
