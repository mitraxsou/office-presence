import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { futureTimeError, buttonLabel } from "@/lib/correction-approval";
import { judgeCorrection, previewEffect, visitTimes, type RequestedSnapshot } from "@/lib/corrections";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const sp = new URL(request.url).searchParams;
  const day = sp.get("day") ?? "";
  const officeId = sp.get("office_id");
  const remove = sp.get("remove") === "1";
  const surface = sp.get("surface") === "today" ? "today" : "review";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "day required" }, { status: 400 });
  }
  const outRaw = sp.get("out_at");
  const requested: RequestedSnapshot = remove
    ? { remove: true }
    : {
        office_id: officeId,
        in_at: sp.get("in_at") ?? `${day}T09:30:00.000Z`,
        out_at: outRaw === "" || sp.get("still_in") === "1" ? null : outRaw ?? `${day}T17:30:00.000Z`,
      };
  const future = futureTimeError(visitTimes(requested), new Date());
  if (future) return NextResponse.json({ error: future }, { status: 400 });
  const [effect, judged] = await Promise.all([
    previewEffect(actor.user.id, day, requested),
    judgeCorrection(actor.user.id, actor.user.role, day),
  ]);
  return NextResponse.json({
    effect,
    outcome: judged.outcome,
    reason: judged.reason,
    button: buttonLabel(judged.outcome, surface),
  });
}
