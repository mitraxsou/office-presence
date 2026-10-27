import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminRoster, filtersFromSearchParams } from "@/lib/roster";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const filters = filtersFromSearchParams(new URL(request.url).searchParams);
  return NextResponse.json(await adminRoster(filters));
}
