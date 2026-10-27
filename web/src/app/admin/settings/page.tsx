import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPolicy } from "@/lib/policy";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  const [policy, activeOffices] = await Promise.all([
    getPolicy(),
    prisma.officeLocation.count({ where: { status: "active" } }),
  ]);
  return (
    <AppShell role="admin" active="/admin/settings">
      <SettingsClient
        policy={{
          ...policy,
          monthlyPointsTarget: policy.monthlyPointsTarget ?? 8,
          correctionWindowDays: (policy as { correctionWindowDays?: number }).correctionWindowDays ?? 5,
        }}
        activeOffices={activeOffices}
      />
    </AppShell>
  );
}
