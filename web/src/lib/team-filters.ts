import { prisma } from "./db";
import { displayName } from "./display-name";

/** Team and manager options for admin Roster and Reports filters. */
export async function teamFilterOptions() {
  const [teams, managers] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { deactivatedAt: null, reports: { some: { deactivatedAt: null } } },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        colleagueDisplayMode: true,
      },
      orderBy: { email: "asc" },
    }),
  ]);
  return {
    teams,
    managers: managers.map((m) => ({ id: m.id, name: displayName(m) })),
  };
}
