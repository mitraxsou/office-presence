import { NextResponse } from "next/server";
import { resolveActor, unauthorized } from "@/lib/actor";
import { recordApiActivity } from "@/lib/device-api-activity";
import { computeUserYear } from "@/lib/year-stats";
import { monthKeyInTz } from "@/lib/presence";

export async function GET(request: Request) {
  const started = Date.now();
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();

  const tz = actor.user.timezone || "Asia/Kolkata";
  const sp = new URL(request.url).searchParams;
  const currentYear = Number(monthKeyInTz(new Date(), tz).slice(0, 4));
  const raw = sp.get("year");
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : currentYear;
  if (year < 2000 || year > currentYear + 1) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const payload = await computeUserYear(actor.user.id, year);

  recordApiActivity({
    userId: actor.user.id,
    deviceTokenId: actor.device?.id,
    method: "GET",
    path: "/api/me/year",
    statusCode: 200,
    durationMs: Date.now() - started,
    note: String(year),
  });

  return NextResponse.json(payload);
}
