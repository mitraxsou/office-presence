import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { previewEffect, type RequestedSnapshot } from "@/lib/corrections";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const sp = new URL(request.url).searchParams;
  const day = sp.get("day") ?? "";
  const officeId = sp.get("office_id");
  const remove = sp.get("remove") === "1";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "day required" }, { status: 400 });
  }
  const requested: RequestedSnapshot = remove
    ? { remove: true }
    : {
        office_id: officeId,
        in_at: sp.get("in_at") ?? `${day}T09:30:00.000Z`,
        out_at: sp.get("out_at") ?? `${day}T17:30:00.000Z`,
      };
  const effect = await previewEffect(actor.user.id, day, requested);
  return NextResponse.json({ effect });
}
