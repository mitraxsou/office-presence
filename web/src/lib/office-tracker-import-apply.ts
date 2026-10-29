import { prisma } from "./db";
import { recomputeUserPresence } from "./presence";
import {
  parseOfficeTrackerCsv,
  planOfficeTrackerImport,
  type ExistingUser,
  type ExistingVisit,
  type ImportPlan,
} from "./office-tracker-import";

/** Whole-word or exact name match for EGL (case insensitive). */
const EGL_NAME_RE = /\begl\b/i;
const INSERT_CHUNK = 500;

export class OfficeTrackerImportError extends Error {}

/**
 * Find the single active office named EGL (exact or as a whole word, e.g.
 * "EGL (Embassy GolfLinks, Bengaluru)"). Stops the import if missing or ambiguous.
 */
export async function findEglOffice() {
  const candidates = await prisma.officeLocation.findMany({
    where: {
      status: "active",
      name: { contains: "EGL", mode: "insensitive" },
    },
    select: { id: true, name: true, pointsPerVisitDay: true },
  });
  const matches = candidates.filter((o) => EGL_NAME_RE.test(o.name.trim()));
  if (matches.length === 0) {
    throw new OfficeTrackerImportError(
      "No active office named EGL. Create or activate it before importing.",
    );
  }
  if (matches.length > 1) {
    throw new OfficeTrackerImportError(
      `More than one office matches EGL: ${matches.map((m) => m.name).join(", ")}`,
    );
  }
  return matches[0];
}

export type OfficeTrackerImportReport = {
  dryRun: boolean;
  office: { id: string; name: string; pointsPerVisitDay: number };
  counts: ImportPlan["counts"];
  usersToCreate: ImportPlan["usersToCreate"];
  skippedUsers: ImportPlan["skippedUsers"];
  issues: ImportPlan["issues"];
  applied?: {
    usersCreated: number;
    homeOfficesSet: number;
    visitsInserted: number;
    usersRecomputed: number;
    errors: Array<{ email: string; reason: string }>;
  };
};

export async function runOfficeTrackerImport(args: {
  adminId: string;
  csv: string;
  dryRun: boolean;
  now?: Date;
}): Promise<OfficeTrackerImportReport> {
  const now = args.now ?? new Date();
  const parsed = parseOfficeTrackerCsv(args.csv);
  if (parsed.headerError) {
    throw new OfficeTrackerImportError(parsed.headerError);
  }

  const fallbackOffice = await findEglOffice();

  const emails = [...new Set(parsed.rows.map((r) => r.email))];
  const dbUsers = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: {
          id: true,
          email: true,
          role: true,
          timezone: true,
          homeOfficeId: true,
          deactivatedAt: true,
        },
      })
    : [];

  const existingUsers: ExistingUser[] = dbUsers.map((u) => ({
    id: u.id,
    email: u.email.toLowerCase(),
    role: u.role,
    timezone: u.timezone,
    homeOfficeId: u.homeOfficeId,
    deactivated: u.deactivatedAt !== null,
  }));

  const visitRows = dbUsers.length
    ? await prisma.visit.findMany({
        where: { userId: { in: dbUsers.map((u) => u.id) } },
        select: { userId: true, startAt: true, endAt: true, reason: true },
      })
    : [];
  const visitsByUserId = new Map<string, ExistingVisit[]>();
  for (const v of visitRows) {
    const list = visitsByUserId.get(v.userId) ?? [];
    list.push({ startAt: v.startAt, endAt: v.endAt, reason: v.reason });
    visitsByUserId.set(v.userId, list);
  }

  const plan = planOfficeTrackerImport({
    rows: parsed.rows,
    existingUsers,
    visitsByUserId,
    fallbackOfficeId: fallbackOffice.id,
    now,
  });

  const report: OfficeTrackerImportReport = {
    dryRun: args.dryRun,
    office: fallbackOffice,
    counts: plan.counts,
    usersToCreate: plan.usersToCreate,
    skippedUsers: plan.skippedUsers,
    issues: [...parsed.issues, ...plan.issues],
  };
  if (args.dryRun) return report;

  const officeIds = [...new Set([
    fallbackOffice.id,
    ...plan.daysToInsert.map((d) => d.officeLocationId),
  ])];
  const officeRows = await prisma.officeLocation.findMany({
    where: { id: { in: officeIds } },
    select: { id: true, pointsPerVisitDay: true },
  });
  const pointsByOfficeId = new Map(officeRows.map((o) => [o.id, o.pointsPerVisitDay]));
  pointsByOfficeId.set(fallbackOffice.id, fallbackOffice.pointsPerVisitDay);

  const errors: Array<{ email: string; reason: string }> = [];
  const userIdByEmail = new Map(existingUsers.map((u) => [u.email, u.id]));

  let usersCreated = 0;
  for (const u of plan.usersToCreate) {
    try {
      const created = await prisma.user.create({
        data: {
          email: u.email,
          name: u.name || null,
          preferredName: u.preferredName || null,
          timezone: u.timezone,
          role: u.role,
          homeOfficeId: fallbackOffice.id,
        },
        select: { id: true },
      });
      userIdByEmail.set(u.email, created.id);
      usersCreated += 1;
    } catch {
      errors.push({ email: u.email, reason: "Could not create user (email may already exist)" });
    }
  }

  const homeOffice = await prisma.user.updateMany({
    where: { id: { in: plan.usersToAttachHomeOffice }, homeOfficeId: null },
    data: { homeOfficeId: fallbackOffice.id },
  });

  const rowsToInsert = plan.daysToInsert.flatMap((d) => {
    const userId = userIdByEmail.get(d.email);
    if (!userId) {
      errors.push({ email: d.email, reason: `No user for day ${d.dayKey}` });
      return [];
    }
    const pointsAwarded = pointsByOfficeId.get(d.officeLocationId) ?? fallbackOffice.pointsPerVisitDay;
    return [
      {
        userId,
        startAt: d.startAt,
        endAt: d.endAt,
        source: "admin" as const,
        reason: `office-tracker-backfill:${d.dayKey}`,
        editedBy: args.adminId,
        officeLocationId: d.officeLocationId,
        pointsAwarded,
      },
    ];
  });

  let visitsInserted = 0;
  for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK) {
    const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK);
    const result = await prisma.visit.createMany({ data: chunk });
    visitsInserted += result.count;
  }

  const affectedUserIds = [...new Set(rowsToInsert.map((r) => r.userId))];
  for (const userId of affectedUserIds) {
    await recomputeUserPresence(userId, { flushAlerts: false });
  }

  await prisma.auditLog.create({
    data: {
      actorId: args.adminId,
      action: "import.office_tracker",
      targetType: "import",
      afterJson: {
        office: { id: fallbackOffice.id, name: fallbackOffice.name },
        usersCreated,
        homeOfficesSet: homeOffice.count,
        visitsInserted,
        usersRecomputed: affectedUserIds.length,
        counts: plan.counts,
        errors: errors.length,
      },
      reason: "Office Tracker presence backfill (home office or EGL)",
    },
  });

  report.applied = {
    usersCreated,
    homeOfficesSet: homeOffice.count,
    visitsInserted,
    usersRecomputed: affectedUserIds.length,
    errors,
  };
  return report;
}
