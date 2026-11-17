import { NextResponse } from "next/server";
import { forbidden, resolveActor, unauthorized } from "@/lib/actor";
import { canManage } from "@/lib/team-scope";
import { teamMemberMonth } from "@/lib/team-view";

type Ctx = { params: Promise<{ userId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const { userId } = await ctx.params;
  if (!(await canManage(actor.user.id, userId))) return forbidden();
  const month = new URL(request.url).searchParams.get("month");
  const view = await teamMemberMonth(userId, month);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view);
}
