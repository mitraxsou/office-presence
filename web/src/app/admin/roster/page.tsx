import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { adminRoster } from "@/lib/roster";
import { prisma } from "@/lib/db";
import { teamFilterOptions } from "@/lib/team-filters";
import AppShell from "@/components/AppShell";
import AdminClient from "../AdminClient";

export default async function RosterPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  const [roster, offices, filters] = await Promise.all([
    adminRoster(),
    prisma.officeLocation.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    teamFilterOptions(),
  ]);
  return (
    <AppShell role="admin" active="/admin/roster">
      <AdminClient initial={roster} offices={offices} teams={filters.teams} managers={filters.managers} />
    </AppShell>
  );
}
