import { NextResponse } from "next/server";
import { runRetention } from "@/lib/retention";

export const maxDuration = 60;

/** Header only: Authorization: Bearer CRON_SECRET. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/** Daily. Clears old event coordinates and deletes short-lived auth rows. */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const counts = await runRetention();
  return NextResponse.json({ ok: true, ...counts });
}

export async function GET(request: Request) {
  return POST(request);
}
