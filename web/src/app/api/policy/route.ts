import { NextResponse } from "next/server";
import { getPolicy } from "@/lib/policy";
import { resolveActor, unauthorized } from "@/lib/actor";
import { officesForUser } from "@/lib/offices-view";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const [policy, offices] = await Promise.all([getPolicy(), officesForUser(actor.user.id)]);
  return NextResponse.json({ policy, offices, fence: offices[0] ?? null });
}
