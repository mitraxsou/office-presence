import { prisma } from "./db";
import { getPolicy } from "./policy";

const ONLINE_MS = 15 * 60 * 1000;
const NO_SYNC_MS = 24 * 60 * 60 * 1000;

export type AdminRosterFilters = {
  q?: string;
  office?: string;
  status?: "all" | "in" | "out";
  belowTarget?: boolean;
};

export type RosterUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  inOffice: boolean;
  sinceAt: string | null;
  officeName: string | null;
  officeLocationId: string | null;
  hoursToday: number;
  monthPoints: number;
  monthVisitDays: number;
  monthDays: number;
  lastDeviceName: string | null;
  devices: number;
  devicesOnline: number;
  lastEvidenceAt: string | null;
  noRecentSync: boolean;
};

export type RosterStats = {
  inNow: number;
  out: number;
  belowTarget: number;
  goalMet: number;
};

/** True when no device lastSeenAt and no lastEvidenceAt fall within the window. */
export function isNoRecentSync(
  deviceLastSeenAts: (Date | null | undefined)[],
  lastEvidenceAt: Date | null | undefined,
  nowMs = Date.now(),
  windowMs = NO_SYNC_MS,
): boolean {
  const recentDevice = deviceLastSeenAts.some((d) => d != null && nowMs - d.getTime() < windowMs);
  const recentEvidence = lastEvidenceAt != null && nowMs - lastEvidenceAt.getTime() < windowMs;
  return !recentDevice && !recentEvidence;
}

export function computeRosterStats(users: { inOffice: boolean; monthPoints: number }[], pointsTarget: number): RosterStats {
  let inNow = 0;
  let out = 0;
  let belowTarget = 0;
  let goalMet = 0;
  for (const u of users) {
    if (u.inOffice) inNow += 1;
    else out += 1;
    if (u.monthPoints >= pointsTarget) goalMet += 1;
    else belowTarget += 1;
  }
  return { inNow, out, belowTarget, goalMet };
}

export function applyRosterFilters(
  users: RosterUserRow[],
  filters: AdminRosterFilters,
  pointsTarget: number,
): RosterUserRow[] {
  const q = filters.q?.trim().toLowerCase() ?? "";
  const office = filters.office?.trim() ?? "";
  const officeLower = office.toLowerCase();
  const status = filters.status ?? "all";
  return users.filter((u) => {
    if (q) {
      const name = (u.name ?? "").toLowerCase();
      const email = u.email.toLowerCase();
      if (!name.includes(q) && !email.includes(q)) return false;
    }
    if (office) {
      const idMatch = u.officeLocationId === office;
      const nameMatch = (u.officeName ?? "").toLowerCase().includes(officeLower);
      if (!idMatch && !nameMatch) return false;
    }
    if (status === "in" && !u.inOffice) return false;
    if (status === "out" && u.inOffice) return false;
    if (filters.belowTarget === true && u.monthPoints >= pointsTarget) return false;
    return true;
  });
}

function parseBelowTarget(raw: string | null | undefined): boolean | undefined {
  if (raw == null || raw === "") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return undefined;
}

export function filtersFromSearchParams(sp: URLSearchParams): AdminRosterFilters {
  const statusRaw = (sp.get("status") ?? "all").toLowerCase();
  const status: AdminRosterFilters["status"] =
    statusRaw === "in" || statusRaw === "out" || statusRaw === "all" ? statusRaw : "all";
  return {
    q: sp.get("q") ?? undefined,
    office: sp.get("office") ?? undefined,
    status,
    belowTarget: parseBelowTarget(sp.get("belowTarget")),
  };
}

/** Admin roster: one row per person, merged across their phones. */
export async function adminRoster(filters: AdminRosterFilters = {}) {
  const policy = await getPolicy();
  const pointsTarget = policy.monthlyPointsTarget ?? 8;
  const users = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      isTestAccount: false,
      isDummy: false,
    },
    orderBy: { email: "asc" },
    include: {
      status: true,
      deviceTokens: { where: { revokedAt: null }, select: { lastSeenAt: true, label: true } },
    },
  });
  const now = Date.now();
  const allUsers: RosterUserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    inOffice: u.status?.inOffice ?? false,
    sinceAt: u.status?.sinceAt?.toISOString() ?? null,
    officeName: u.status?.officeName ?? null,
    officeLocationId: u.status?.officeLocationId ?? null,
    hoursToday: u.status?.hoursToday ?? 0,
    monthPoints: u.status?.monthPoints ?? 0,
    monthVisitDays: u.status?.monthVisitDays ?? 0,
    monthDays: u.status?.monthDays ?? 0,
    lastDeviceName: u.status?.lastDeviceName ?? null,
    devices: u.deviceTokens.length,
    devicesOnline: u.deviceTokens.filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < ONLINE_MS).length,
    lastEvidenceAt: u.status?.lastEvidenceAt?.toISOString() ?? null,
    noRecentSync: isNoRecentSync(
      u.deviceTokens.map((d) => d.lastSeenAt),
      u.status?.lastEvidenceAt ?? null,
      now,
    ),
  }));

  const stats = computeRosterStats(allUsers, pointsTarget);
  const filtered = applyRosterFilters(allUsers, filters, pointsTarget);

  return {
    pointsTarget,
    dayHoursAdvisory: policy.dayHours,
    stats,
    users: filtered,
  };
}

export type RosterRow = Awaited<ReturnType<typeof adminRoster>>["users"][number];
