import { prisma } from "@/lib/db";

/** Short TTL so AppShell does not hit Prisma on every admin navigation. */
const TTL_MS = 3 * 60_000;
let cachedAt = 0;
let cachedCount = 0;

export async function getPendingCorrectionsCount(): Promise<number> {
  const now = Date.now();
  if (now - cachedAt < TTL_MS) return cachedCount;
  cachedCount = await prisma.visitCorrectionRequest.count({ where: { status: "pending" } });
  cachedAt = now;
  return cachedCount;
}

export function invalidatePendingCorrectionsCount() {
  cachedAt = 0;
}
