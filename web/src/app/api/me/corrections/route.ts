import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rejectIfReadonlyViewAs, resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import {
  assertNoPendingCorrection,
  dayVisitSnapshot,
  decideCorrection,
  isMonthLocked,
  judgeCorrection,
  previewEffect,
  undoOwnCorrection,
  visitTimes,
  type CorrectionIssue,
} from "@/lib/corrections";
import { futureTimeError } from "@/lib/correction-approval";
import { parseCorrectionRequest } from "@/lib/correction-request";
import { getPolicy } from "@/lib/policy";

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
    recordApiActivity({
      userId: actor.user.id,
      deviceTokenId: actor.device?.id,
      method: "POST",
      path: "/api/me/corrections",
      statusCode: 200,
      note: "cancel",
      throttle: false,
    });
    return NextResponse.json({ request: updated });
  }

  if (action === "undo") {
    const id = String(body.id ?? "");
    const row = await prisma.visitCorrectionRequest.findFirst({
      where: { id, userId: actor.user.id },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const undone = await undoOwnCorrection(row, actor.user.id);
    if (!undone.ok) return NextResponse.json({ error: undone.error }, { status: undone.status });
    return NextResponse.json({ request: undone.request, outcome: "undone" });
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

  const policy = await getPolicy();
  if (isMonthLocked(dayKey, policy.correctionWindowDays ?? 5)) {
    return NextResponse.json({ error: "This month is locked" }, { status: 400 });
  }
  const gate = await assertNoPendingCorrection(actor.user.id, dayKey);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = parseCorrectionRequest(body, dayKey);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { requested, proposedStart, proposedEnd, officeLocationId } = parsed;
  if (parsed.officeIds.length) {
    const active = await prisma.officeLocation.findMany({
      where: { id: { in: parsed.officeIds }, status: "active" },
      select: { id: true },
    });
    if (active.length !== parsed.officeIds.length) {
      return NextResponse.json({ error: "Office not found" }, { status: 404 });
    }
  }

  const future = futureTimeError(visitTimes(requested), new Date());
  if (future) return NextResponse.json({ error: future }, { status: 400 });

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
  recordApiActivity({
    userId: actor.user.id,
    deviceTokenId: actor.device?.id,
    method: "POST",
    path: "/api/me/corrections",
    statusCode: 200,
    note: "create",
    throttle: false,
  });

  const judged = await judgeCorrection(actor.user.id, actor.user.role, dayKey);
  if (judged.outcome === "pending") {
    const pending = await prisma.visitCorrectionRequest.update({
      where: { id: row.id },
      data: { pendingReason: judged.reason },
    });
    return NextResponse.json({
      request: pending,
      effect,
      outcome: "pending",
      reason: judged.reason,
      appliedImmediately: false,
    });
  }

  const decided = await decideCorrection({
    row,
    actorId: null,
    decision: "approve",
    applied: requested,
    reviewNote: "Applied immediately",
    asAuto: true,
  });
  return NextResponse.json({
    request: decided.request,
    effect,
    outcome: "auto_approved",
    reason: null,
    appliedImmediately: true,
  });
}