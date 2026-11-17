import { NextResponse } from "next/server";
import { pushDailyAppUpdateReminders } from "@/lib/firebase-admin";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

/**
 * Once a day for phones still on an older version.
 * The weekday presence-ping cron also calls this. Use this route to cover weekends.
 */
async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const appUpdate = await pushDailyAppUpdateReminders();
  return NextResponse.json({ ok: true, appUpdate });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
