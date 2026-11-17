import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized } from "@/lib/actor";
import { getPolicy } from "@/lib/policy";
import { consentState, requiredNoticeVersion } from "@/lib/consent";
import { sendForceSignOutToUser } from "@/lib/firebase-admin";

/** Tracking consent. Colleague sharing stays on /api/me/privacy. */
export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  return NextResponse.json(consentState(actor.user, await getPolicy()));
}

function rejectViewAs(viewAs: unknown) {
  if (!viewAs) return null;
  return NextResponse.json({ error: "Consent can only be given by the person themselves." }, { status: 403 });
}

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectViewAs(actor.viewAs);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => ({}))) as { version?: unknown };
  const rules = await getPolicy();
  const required = requiredNoticeVersion(rules);
  if (typeof body.version !== "string" || body.version !== required) {
    return NextResponse.json({ error: "Accept the current notice", requiredVersion: required }, { status: 400 });
  }
  const before = actor.user;
  const user = await prisma.user.update({
    where: { id: before.id },
    data: { privacyConsentVersion: required, privacyConsentAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: before.id,
      action: "privacy.consent",
      targetType: "User",
      targetId: before.id,
      beforeJson: { privacyConsentVersion: before.privacyConsentVersion ?? null },
      afterJson: { privacyConsentVersion: required, via: actor.device ? "phone" : "web" },
    },
  });
  return NextResponse.json(consentState(user, rules));
}

/**
 * Withdraw consent. From a phone: revoke that phone only. From the website: revoke every phone.
 * Past visits and colleague sharing are left as they are.
 */
export async function DELETE(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectViewAs(actor.viewAs);
  if (blocked) return blocked;
  const before = actor.user;
  const now = new Date();
  if (!actor.device) {
    await sendForceSignOutToUser(before.id, {
      reason: "consent_withdrawn",
      message: "You withdrew consent on the website. Tracking is off on this phone.",
    }).catch(() => undefined);
  }
  const [user, revoked] = await prisma.$transaction([
    prisma.user.update({
      where: { id: before.id },
      data: { privacyConsentVersion: null, privacyConsentAt: null },
    }),
    prisma.deviceToken.updateMany({
      where: actor.device ? { id: actor.device.id, revokedAt: null } : { userId: before.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  await prisma.auditLog.create({
    data: {
      actorId: before.id,
      action: "privacy.withdraw",
      targetType: "User",
      targetId: before.id,
      beforeJson: { privacyConsentVersion: before.privacyConsentVersion ?? null },
      afterJson: { via: actor.device ? "phone" : "web", devicesRevoked: revoked.count },
    },
  });
  return NextResponse.json({ ...consentState(user, await getPolicy()), devicesRevoked: revoked.count });
}
