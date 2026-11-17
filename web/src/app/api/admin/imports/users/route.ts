import { NextResponse } from "next/server";
import { requireRealAdmin } from "@/lib/auth";
import { runTeamImport } from "@/lib/team-import";

/**
 * Admin-only import of managers and teams.
 * Body: raw CSV (text/csv) or JSON { csv }. Columns: email, managerEmail, teamName.
 * Query: dryRun=true|false (default true). Problem rows are skipped.
 */
export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireRealAdmin();
  } catch (res) {
    return res as Response;
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") !== "false";
  let csv = "";
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { csv?: unknown } | null;
    csv = typeof body?.csv === "string" ? body.csv : "";
  } else {
    csv = await request.text();
  }
  if (!csv.trim()) return NextResponse.json({ error: "CSV body required" }, { status: 400 });
  const report = await runTeamImport({ adminId: admin.id, csv, dryRun });
  return NextResponse.json(report);
}
