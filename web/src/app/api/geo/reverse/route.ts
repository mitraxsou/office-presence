import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/offices";
import { requireAdmin, getSession } from "@/lib/auth";
import { authenticateDeviceToken } from "@/lib/otp";

export async function GET(request: Request) {
  const session = await getSession();
  const deviceUser = session ? null : await authenticateDeviceToken(request.headers.get("authorization"));
  if (!session && !deviceUser) {
    try { await requireAdmin(); } catch (res) { return res as Response; }
  }
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  const addressLabel = await reverseGeocode(lat, lng);
  return NextResponse.json({ addressLabel });
}
