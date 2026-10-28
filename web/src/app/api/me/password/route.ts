import { NextResponse } from "next/server";
import { resolveActor, unauthorized, rejectIfReadonlyViewAs } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import {
  setUserPassword,
  clearUserPassword,
  userHasPassword,
  validatePasswordPlain,
  passwordsMatch,
} from "@/lib/password";
import { prisma } from "@/lib/db";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const hasPassword = await userHasPassword(actor.user.id);
  return NextResponse.json({ hasPassword }, { headers: NO_STORE });
}

/**
 * Set or change password for the signed-in user.
 * Body: { password, currentPassword? }
 * currentPassword is required when a password is already set.
 */
export async function PUT(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const validated = validatePasswordPlain(body.password);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400, headers: NO_STORE });
  }

  const confirm =
    typeof body.confirmPassword === "string"
      ? body.confirmPassword
      : typeof body.passwordConfirm === "string"
        ? body.passwordConfirm
        : null;
  if (confirm != null && confirm !== validated.password) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400, headers: NO_STORE });
  }

  const row = await prisma.user.findUnique({
    where: { id: actor.user.id },
    select: { passwordHash: true },
  });
  if (row?.passwordHash) {
    const current =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!current || !(await passwordsMatch(current, row.passwordHash))) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401, headers: NO_STORE },
      );
    }
  }

  await setUserPassword(actor.user.id, validated.password);
  recordApiActivity({
    userId: actor.user.id,
    deviceTokenId: actor.device?.id,
    method: "PUT",
    path: "/api/me/password",
    statusCode: 200,
    note: "set",
    throttle: false,
  });
  return NextResponse.json({ ok: true, hasPassword: true }, { headers: NO_STORE });
}

/** Remove password sign-in (Teams OTP still works). Requires current password. */
export async function DELETE(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const row = await prisma.user.findUnique({
    where: { id: actor.user.id },
    select: { passwordHash: true },
  });
  if (!row?.passwordHash) {
    return NextResponse.json({ ok: true, hasPassword: false }, { headers: NO_STORE });
  }
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!current || !(await passwordsMatch(current, row.passwordHash))) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401, headers: NO_STORE },
    );
  }
  await clearUserPassword(actor.user.id);
  return NextResponse.json({ ok: true, hasPassword: false }, { headers: NO_STORE });
}
