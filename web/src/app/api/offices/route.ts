import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { officesForUser } from "@/lib/offices-view";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  return NextResponse.json({ offices: await officesForUser(actor.user.id) });
}
