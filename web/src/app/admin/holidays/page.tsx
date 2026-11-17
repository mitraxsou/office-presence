import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPolicy } from "@/lib/policy";
import AppShell from "@/components/AppShell";
import HolidaysClient from "./HolidaysClient";

export default async function AdminHolidaysPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  const policy = await getPolicy();
  return (
    <AppShell role="admin" active="/admin/holidays">
      <HolidaysClient year={new Date().getUTCFullYear()} pointsTarget={policy.monthlyPointsTarget ?? 8} />
    </AppShell>
  );
}
