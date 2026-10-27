import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { monthKeyInTz } from "@/lib/presence";
import AppShell from "@/components/AppShell";
import AdminReportsClient from "./AdminReportsClient";

export default async function AdminReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  const [offices, policy] = await Promise.all([
    prisma.officeLocation.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getPolicy(),
  ]);
  return (
    <AppShell role="admin" active="/admin/reports">
      <AdminReportsClient offices={offices} initialMonth={monthKeyInTz(new Date(), policy.timezone)} />
    </AppShell>
  );
}
