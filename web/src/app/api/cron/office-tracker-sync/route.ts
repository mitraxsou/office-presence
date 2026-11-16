import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { OFFICE_TRACKER_SYNC_AUDIT_ACTION } from "@/lib/office-tracker-import";
import { readOfficeTrackerSyncAudit } from "@/lib/office-tracker-sync-status";
import {
  OfficeTrackerImportError,
  runOfficeTrackerImport,
} from "@/lib/office-tracker-import-apply";
import { dayKeyInTz } from "@/lib/visit-calculator";

export const maxDuration = 300;

const SYNC_TIMEZONE = "Asia/Kolkata";
const DEFAULT_TRACKER_SYNC_URL =
  "https://office-tracker-theta.vercel.app/api/cron/presence-backfill";

/** Same CRON_SECRET check as /api/cron/presence-ping. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

function trackerSyncUrl(): string {
  const configured = process.env.OFFICE_TRACKER_SYNC_URL?.trim();
  return configured || DEFAULT_TRACKER_SYNC_URL;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** People whose phone app is installed and has checked in at least once. */
async function emailsWithActiveApp(): Promise<Set<string>> {
  const tokens = await prisma.deviceToken.findMany({
    where: { revokedAt: null, lastSeenAt: { not: null } },
    select: { user: { select: { email: true } } },
  });
  const emails = new Set<string>();
  for (const token of tokens) {
    const email = token.user.email.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const dayKey = dayKeyInTz(new Date(), SYNC_TIMEZONE);

  if (!force) {
    const latest = await prisma.auditLog.findFirst({
      where: { action: OFFICE_TRACKER_SYNC_AUDIT_ACTION },
      orderBy: { createdAt: "desc" },
      select: { afterJson: true },
    });
    const previous = asRecord(latest?.afterJson);
    if (previous?.dayKey === dayKey) {
      const summary = readOfficeTrackerSyncAudit(previous);
      return NextResponse.json({
        ok: true,
        alreadySynced: true,
        dayKey,
        visitsInserted: summary.daysAdded,
        usersSkippedAppActive: summary.usersSkippedAppActive,
        counts: previous.counts ?? null,
        previous,
      });
    }
  }

  const trackerSecret = process.env.OFFICE_TRACKER_SYNC_SECRET?.trim();
  if (!trackerSecret) {
    return NextResponse.json({ error: "OFFICE_TRACKER_SYNC_SECRET is not set" }, { status: 500 });
  }

  let trackerResponse: Response;
  try {
    trackerResponse = await fetch(trackerSyncUrl(), {
      method: "GET",
      headers: { Authorization: `Bearer ${trackerSecret}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[office-tracker-sync] fetch failed", err);
    return NextResponse.json({ error: "Could not reach Office Tracker" }, { status: 502 });
  }

  if (!trackerResponse.ok) {
    return NextResponse.json(
      { error: "Office Tracker export failed", status: trackerResponse.status },
      { status: 502 },
    );
  }

  const csv = await trackerResponse.text();
  if (!csv.trim()) {
    return NextResponse.json({ error: "Office Tracker export was empty" }, { status: 502 });
  }

  try {
    const skipEmails = await emailsWithActiveApp();
    const report = await runOfficeTrackerImport({
      adminId: null,
      csv,
      dryRun: false,
      skipEmails,
      auditAction: OFFICE_TRACKER_SYNC_AUDIT_ACTION,
    });
    return NextResponse.json({ ok: true, alreadySynced: false, dayKey, ...report });
  } catch (err) {
    if (err instanceof OfficeTrackerImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[office-tracker-sync] failed", err);
    return NextResponse.json({ error: "Office Tracker sync failed" }, { status: 500 });
  }
}

/** Daily Office Tracker pull. Not called from presence-ping or correction-digest. */
export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
