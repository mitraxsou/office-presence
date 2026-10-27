import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
import {
  assertCanCreate,
  dayVisitSnapshot,
  previewEffect,
  type CorrectionIssue,
  type RequestedSnapshot,
} from "@/lib/corrections";

const ISSUES = new Set<CorrectionIssue>([
  "missing_visit",
  "wrong_times",
  "wrong_office",
  "should_not_count",
]);

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const sp = new URL(request.url).searchParams;
  const month = sp.get("month");
  const where = {
    userId: actor.user.id,
    ...(month ? { dayKey: { startsWith: month } } : {}),
  };
  const rows = await prisma.visitCorrectionRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ requests: rows });
}

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({}));

  const action = String(body.action ?? "");
  if (action === "cancel") {
    const id = String(body.id ?? "");
    const row = await prisma.visitCorrectionRequest.findFirst({
      where: { id, userId: actor.user.id, status: "pending" },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.visitCorrectionRequest.update({
      where: { id },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ request: updated });
  }

  const dayKey = String(body.day ?? body.dayKey ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  const issueRaw = String(body.issue ?? "wrong_times") as CorrectionIssue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !reason) {
    return NextResponse.json({ error: "day, issue, and reason required" }, { status: 400 });
  }
  if (!ISSUES.has(issueRaw)) {
    return NextResponse.json({ error: "Invalid issue" }, { status: 400 });
  }

  const gate = await assertCanCreate(actor.user.id, dayKey);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let requested: RequestedSnapshot;
  let proposedStart: Date;
  let proposedEnd: Date;
  let officeLocationId: string | null = null;

  if (issueRaw === "should_not_count" || body.requested?.remove === true) {
    requested = { remove: true };
    proposedStart = new Date(`${dayKey}T00:00:00.000Z`);
    proposedEnd = new Date(`${dayKey}T00:01:00.000Z`);
  } else {
    const req = body.requested ?? {};
    const inAt = String(req.in_at ?? body.proposedStart ?? "");
    const outAt = String(req.out_at ?? body.proposedEnd ?? "");
    officeLocationId = req.office_id != null
      ? String(req.office_id)
      : body.officeLocationId
        ? String(body.officeLocationId)
        : null;
    proposedStart = new Date(inAt);
    proposedEnd = new Date(outAt);
    if (Number.isNaN(proposedStart.getTime()) || Number.isNaN(proposedEnd.getTime()) || proposedEnd <= proposedStart) {
      return NextResponse.json({ error: "Valid in_at and out_at required" }, { status: 400 });
    }
    if (officeLocationId) {
      const office = await prisma.officeLocation.findUnique({ where: { id: officeLocationId } });
      if (!office) return NextResponse.json({ error: "Office not found" }, { status: 404 });
    }
    requested = { office_id: officeLocationId, in_at: proposedStart.toISOString(), out_at: proposedEnd.toISOString() };
  }

  const recorded = await dayVisitSnapshot(actor.user.id, dayKey);
  const effect = await previewEffect(actor.user.id, dayKey, requested);

  const row = await prisma.visitCorrectionRequest.create({
    data: {
      userId: actor.user.id,
      dayKey,
      issue: issueRaw,
      proposedStart,
      proposedEnd,
      officeLocationId,
      reason,
      recorded,
      requested,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: "correction.request",
      targetType: "VisitCorrectionRequest",
      targetId: row.id,
      afterJson: row,
    },
  });
  return NextResponse.json({ request: row, effect });
}
