import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPolicy } from "@/lib/policy";
import { prisma } from "@/lib/db";
import Nav from "@/components/Nav";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/me");
  const [policy, activeOffices] = await Promise.all([
    getPolicy(),
    prisma.officeLocation.count({ where: { status: "active" } }),
  ]);
  return (
    <main>
      <Nav role="admin" active="/admin/settings" />
      <SettingsClient policy={{ ...policy, monthlyPointsTarget: policy.monthlyPointsTarget ?? 8 }} activeOffices={activeOffices} />
    </main>
  );
}
