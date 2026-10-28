import { NextResponse } from "next/server";
import { getPolicy } from "@/lib/policy";
import { sendPresenceCheckToActiveDevices } from "@/lib/firebase-admin";
import { inPresencePingWindow } from "@/lib/presence-ping-window";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const rules = await getPolicy();
  const timezone = rules.timezone || "Asia/Kolkata";
  if (!force && !inPresencePingWindow(new Date(), timezone)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_window",
      timezone,
    });
  }
  const result = await sendPresenceCheckToActiveDevices();
  return NextResponse.json({ ok: true, timezone, ...result });
}

/** External cron: POST every ~60m Mon-Fri. Vercel Hobby native cron is daily-only. */
export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
