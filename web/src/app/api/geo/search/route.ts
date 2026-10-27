import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/offices";
import { requireAdmin, getSession } from "@/lib/auth";
import { authenticateDeviceToken } from "@/lib/otp";

export async function GET(request: Request) {
  const session = await getSession();
  const deviceUser = session ? null : await authenticateDeviceToken(request.headers.get("authorization"));
  if (!session && !deviceUser) {
    try {
      await requireAdmin();
    } catch (res) {
      return res as Response;
    }
  }
  const sp = new URL(request.url).searchParams;
  const q = String(sp.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "q must be at least 2 characters" }, { status: 400 });
  }
  const places = await searchPlaces(q, 8);
  return NextResponse.json({ places });
}
