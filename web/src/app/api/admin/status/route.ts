import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminRoster, filtersFromSearchParams } from "@/lib/roster";
import { getPolicy } from "@/lib/policy";
import { monthKeyInTz } from "@/lib/presence";
import { monthRecordCounts } from "@/lib/month-records";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const sp = new URL(request.url).searchParams;
  const roster = await adminRoster(filtersFromSearchParams(sp));
  if (sp.get("records") !== "1") return NextResponse.json(roster);
  const policy = await getPolicy();
  const records = await monthRecordCounts(
    roster.users.map((u) => ({ id: u.id, homeOfficeId: u.homeOfficeId ?? null })),
    monthKeyInTz(new Date(), policy.timezone),
  );
  return NextResponse.json({
    ...roster,
    users: roster.users.map((u) => ({ ...u, ...records.get(u.id) })),
  });
}
