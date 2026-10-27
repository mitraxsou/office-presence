import { prisma } from "./db";
import { getPolicy } from "./policy";

const ONLINE_MS = 15 * 60 * 1000;

/** Admin roster: one row per person, merged across their phones. */
export async function adminRoster() {
  const policy = await getPolicy();
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    include: {
      status: true,
      deviceTokens: { where: { revokedAt: null }, select: { lastSeenAt: true, label: true } },
    },
  });
  const now = Date.now();
  return {
    pointsTarget: policy.monthlyPointsTarget ?? 8,
    dayHoursAdvisory: policy.dayHours,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      inOffice: u.status?.inOffice ?? false,
      sinceAt: u.status?.sinceAt?.toISOString() ?? null,
      officeName: u.status?.officeName ?? null,
      hoursToday: u.status?.hoursToday ?? 0,
      monthPoints: u.status?.monthPoints ?? 0,
      monthVisitDays: u.status?.monthVisitDays ?? 0,
      monthDays: u.status?.monthDays ?? 0,
      lastDeviceName: u.status?.lastDeviceName ?? null,
      devices: u.deviceTokens.length,
      devicesOnline: u.deviceTokens.filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < ONLINE_MS).length,
      lastEvidenceAt: u.status?.lastEvidenceAt?.toISOString() ?? null,
    })),
  };
}

export type RosterRow = Awaited<ReturnType<typeof adminRoster>>["users"][number];
