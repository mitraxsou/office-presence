import type { Prisma } from "@prisma/client";

/** Demo and test people. The product sets either flag, sometimes both. */
export function isTestOrDummyAccount(user: {
  isTestAccount?: boolean | null;
  isDummy?: boolean | null;
}): boolean {
  return user.isTestAccount === true || user.isDummy === true;
}

/**
 * Colleague query.
 * Sharing, not deactivated, and not the viewer.
 * Non-admins also miss anyone with isTestAccount or isDummy.
 * Admins still receive those people. Admin Roster and Users are separate queries.
 */
export function colleaguePresenceWhere(viewer: { id: string; role: string }): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    sharePresenceWithPeers: true,
    id: { not: viewer.id },
    deactivatedAt: null,
  };
  if (viewer.role !== "admin") {
    where.isTestAccount = false;
    where.isDummy = false;
  }
  return where;
}
