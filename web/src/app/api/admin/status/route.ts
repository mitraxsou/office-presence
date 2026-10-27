import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminRoster } from "@/lib/roster";

export async function GET() {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  return NextResponse.json(await adminRoster());
}
