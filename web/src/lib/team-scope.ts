import { prisma } from "./db";

/**
 * People a manager can see: direct reports plus members of teams they lead.
 * Not the whole sub-tree: a report's reports are out of scope. Never includes the manager.
 */
export async function managedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      id: { not: userId },
      OR: [{ managerId: userId }, { team: { leadUserId: userId } }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function canManage(managerId: string, userId: string): Promise<boolean> {
  if (!managerId || !userId || managerId === userId) return false;
  const row = await prisma.user.findFirst({
    where: {
      id: userId,
      deactivatedAt: null,
      OR: [{ managerId }, { team: { leadUserId: managerId } }],
    },
    select: { id: true },
  });
  return !!row;
}

export async function isManager(userId: string): Promise<boolean> {
  return (await managedUserIds(userId)).length > 0;
}

/**
 * True when making `managerId` the manager of `userId` would form a loop:
 * the person themselves, or anyone above the new manager is the person.
 */
export function wouldCreateManagerCycle(
  userId: string,
  managerId: string | null,
  managerOf: Map<string, string | null>,
): boolean {
  if (!managerId) return false;
  const seen = new Set<string>();
  let cur: string | null = managerId;
  while (cur) {
    if (cur === userId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = managerOf.get(cur) ?? null;
  }
  return false;
}

export async function managerChainMap(): Promise<Map<string, string | null>> {
  const rows = await prisma.user.findMany({ select: { id: true, managerId: true } });
  return new Map(rows.map((r) => [r.id, r.managerId]));
}
