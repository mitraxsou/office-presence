import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { canGrantExceptions } from "@/lib/actor";
import { monthKeyInTz } from "@/lib/presence";
import AppShell from "@/components/AppShell";
import ExceptionsClient from "./ExceptionsClient";

export default async function AdminExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ grant?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.adminId) redirect("/month");
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, role: true, canGrantExceptions: true },
  });
  if (!user || !canGrantExceptions(user)) redirect("/month");
  const [policy, offices, params] = await Promise.all([
    getPolicy(),
    prisma.officeLocation.findMany({
      where: { status: "active", deletedAt: null },
      select: { id: true, name: true, pointsPerVisitDay: true },
      orderBy: { name: "asc" },
    }),
    searchParams,
  ]);
  let grantFor: { id: string; name: string; email: string; homeOffice: { id: string; name: string; pointsPerVisitDay: number } | null } | null = null;
  if (params.grant) {
    const target = await prisma.user.findUnique({
      where: { id: params.grant },
      select: {
        id: true,
        name: true,
        email: true,
        homeOffice: { select: { id: true, name: true, pointsPerVisitDay: true } },
      },
    });
    if (target) grantFor = { id: target.id, name: target.name ?? target.email, email: target.email, homeOffice: target.homeOffice };
  }
  return (
    <AppShell role={user.role === "admin" ? "admin" : "user"} active="/admin/exceptions">
      <ExceptionsClient
        currentMonth={monthKeyInTz(new Date(), policy.timezone)}
        offices={offices}
        pointsTarget={policy.monthlyPointsTarget ?? 8}
        grantFor={grantFor}
        selfId={user.id}
      />
    </AppShell>
  );
}
