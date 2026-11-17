import { NextResponse } from "next/server";
import { forbidden, resolveActor, unauthorized } from "@/lib/actor";
import { prisma } from "@/lib/db";
import { decideCorrection } from "@/lib/corrections";
import { displayName } from "@/lib/display-name";
import { invalidatePendingCorrectionsCount } from "@/lib/pending-corrections-cache";
import { getPolicy } from "@/lib/policy";
import { canManage, managedUserIds } from "@/lib/team-scope";

const personSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  colleagueDisplayMode: true,
} as const;

/** Pending corrections for people in scope. Only when the rule lets managers decide. */
export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const policy = await getPolicy();
  if (!policy.managersDecideCorrections) {
    return NextResponse.json({ error: "Managers do not decide corrections. Ask an admin." }, { status: 403 });
  }
  const ids = (await managedUserIds(actor.user.id)).filter((id) => id !== actor.user.id);
  if (!ids.length) return forbidden();
  const rows = await prisma.visitCorrectionRequest.findMany({
    where: { userId: { in: ids }, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { user: { select: personSelect } },
  });
  const officeIds = [...new Set(rows.map((r) => r.officeLocationId).filter((v): v is string => !!v))];
  const offices = officeIds.length
    ? await prisma.officeLocation.findMany({ where: { id: { in: officeIds } }, select: { id: true, name: true } })
    : [];
  const officeName = new Map(offices.map((o) => [o.id, o.name]));
  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: displayName(r.user),
      dayKey: r.dayKey,
      issue: r.issue,
      officeName: r.officeLocationId ? officeName.get(r.officeLocationId) ?? null : null,
      proposedStart: r.proposedStart.toISOString(),
      proposedEnd: r.proposedEnd.toISOString(),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/** Approve or Not approved. A note is required for Not approved. No revert and no edit. */
export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  if (actor.viewAs) return forbidden();
  const policy = await getPolicy();
  if (!policy.managersDecideCorrections) {
    return NextResponse.json({ error: "Managers do not decide corrections. Ask an admin." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  const reviewNote = body.reviewNote != null ? String(body.reviewNote).trim().slice(0, 500) : "";
  if (!id || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json({ error: "id and decision required" }, { status: 400 });
  }
  const row = await prisma.visitCorrectionRequest.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.userId === actor.user.id) {
    return NextResponse.json({ error: "You cannot decide your own correction requests" }, { status: 403 });
  }
  if (!(await canManage(actor.user.id, row.userId))) return forbidden();
  if (row.status !== "pending") return NextResponse.json({ error: "This request was already decided" }, { status: 409 });
  if (decision === "reject" && !reviewNote) {
    return NextResponse.json({ error: "Add a note to mark it not approved" }, { status: 400 });
  }
  const decided = await decideCorrection({
    row,
    actorId: actor.user.id,
    decision,
    applied: row.requested ?? null,
    reviewNote: reviewNote || null,
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.user.id,
      action: decision === "approve" ? "correction.manager_approve" : "correction.manager_reject",
      targetType: "VisitCorrectionRequest",
      targetId: row.id,
      afterJson: { userId: row.userId, dayKey: row.dayKey },
      reason: reviewNote || null,
    },
  });
  invalidatePendingCorrectionsCount();
  return NextResponse.json({ request: { id: decided.request.id, status: decided.request.status } });
}
