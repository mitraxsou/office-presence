import { NextResponse } from "next/server";
import { forbidden, resolveActor, unauthorized } from "@/lib/actor";
import { managedUserIds } from "@/lib/team-scope";
import { teamStatus } from "@/lib/team-view";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const ids = await managedUserIds(actor.user.id);
  if (!ids.length) return forbidden();
  return NextResponse.json(await teamStatus(ids));
}
