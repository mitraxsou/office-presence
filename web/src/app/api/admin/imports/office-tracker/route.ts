import { NextResponse } from "next/server";
import { requireRealAdmin } from "@/lib/auth";
import {
  OfficeTrackerImportError,
  runOfficeTrackerImport,
} from "@/lib/office-tracker-import-apply";

export const maxDuration = 300;

/**
 * Admin-only import of the Office Tracker presence CSV.
 *
 * Body: the raw CSV (Content-Type text/csv), or JSON { csv: string }.
 * Query: dryRun=true|false (default true). A dry run only reads; apply writes once.
 */
export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireRealAdmin();
  } catch (res) {
    return res as Response;
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") !== "false";

  let csv = "";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { csv?: unknown } | null;
    csv = typeof body?.csv === "string" ? body.csv : "";
  } else {
    csv = await request.text();
  }
  if (!csv.trim()) {
    return NextResponse.json({ error: "CSV body required" }, { status: 400 });
  }

  try {
    const report = await runOfficeTrackerImport({
      adminId: admin.id,
      csv,
      dryRun,
    });
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof OfficeTrackerImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[office-tracker-import] failed", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
