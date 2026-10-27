import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPersonHistory } from "@/lib/admin-day-edits";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const { userId } = await ctx.params;
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const history = await listPersonHistory(userId, month);
  return NextResponse.json({ history });
}
