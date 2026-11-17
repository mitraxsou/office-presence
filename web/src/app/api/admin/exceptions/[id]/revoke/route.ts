import { NextResponse } from "next/server";
import { requireExceptionGranter } from "@/lib/actor";
import { revokeException } from "@/lib/exceptions";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireExceptionGranter(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await revokeException({
    actorId: actor.user.id,
    id,
    reason: typeof body.reason === "string" ? body.reason : "",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, exception: { id: result.exception.id, revokedAt: result.exception.revokedAt } });
}
