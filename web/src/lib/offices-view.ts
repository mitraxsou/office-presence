import { prisma } from "./db";

/** Active offices as the phone and web see them: admin name, personal alias, points. */
export async function officesForUser(userId: string) {
  const [offices, aliases] = await Promise.all([
    prisma.officeLocation.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    prisma.userOfficeAlias.findMany({ where: { userId } }),
  ]);
  const aliasMap = new Map(aliases.map((a) => [a.officeLocationId, a.displayName]));
  return offices.map((o) => ({
    id: o.id,
    name: aliasMap.get(o.id) ?? o.name,
    adminName: o.name,
    alias: aliasMap.get(o.id) ?? null,
    latitude: o.latitude,
    longitude: o.longitude,
    radiusMeters: o.radiusMeters,
    pointsPerVisitDay: o.pointsPerVisitDay,
    addressLabel: o.addressLabel,
  }));
}
