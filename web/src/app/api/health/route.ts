import { NextResponse } from "next/server";
import { getPolicy } from "@/lib/policy";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [policy, activeOffices] = await Promise.all([
      getPolicy(),
      prisma.officeLocation.count({ where: { status: "active" } }),
    ]);
    return NextResponse.json({
      ok: true,
      contract: "points-v1",
      monthlyPointsTarget: policy.monthlyPointsTarget,
      dayHoursAdvisory: policy.dayHours,
      activeOffices,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
