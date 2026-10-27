import { NextResponse } from "next/server";
import { requireRealAdminActor } from "@/lib/actor";
import { prisma } from "@/lib/db";
import { setUserPassword, clearUserPassword, validatePasswordPlain } from "@/lib/password";

const NO_STORE = { "Cache-Control": "no-store" };

type Ctx = { params: Promise<{ id: string }> };

/** Admin sets or clears a user's password (no current-password check). */
export async function PUT(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;

  const { id } = await ctx.params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, deactivatedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers: NO_STORE });
  }
  if (target.deactivatedAt) {
    return NextResponse.json(
      { error: "Reactivate the user before setting a password" },
      { status: 400, headers: NO_STORE },
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body.clear === true || body.password === null) {
    await clearUserPassword(id);
    return NextResponse.json({ ok: true, hasPassword: false }, { headers: NO_STORE });
  }

  const validated = validatePasswordPlain(body.password);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400, headers: NO_STORE });
  }
  await setUserPassword(id, validated.password);
  return NextResponse.json({ ok: true, hasPassword: true }, { headers: NO_STORE });
}
