import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { futureTimeError, buttonLabel } from "@/lib/correction-approval";
import { officeIdsFromQuery } from "@/lib/correction-request";
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
  const inAt = sp.get("in_at") ?? `${day}T09:30:00.000Z`;
  const outAt = outRaw === "" || sp.get("still_in") === "1" ? null : outRaw ?? `${day}T17:30:00.000Z`;
  const officeIds = officeIdsFromQuery(sp.get("office_ids"), officeId);
  const requested: RequestedSnapshot = remove
    ? { remove: true }
    : officeIds.length > 1
      ? { visits: officeIds.map((id) => ({ office_id: id, in_at: inAt, out_at: outAt })) }
      : { office_id: officeIds[0] ?? null, in_at: inAt, out_at: outAt };
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
