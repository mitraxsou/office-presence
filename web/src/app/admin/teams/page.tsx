import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import TeamsClient from "./TeamsClient";

export default async function AdminTeamsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  return (
    <AppShell role="admin" active="/admin/teams">
      <TeamsClient />
    </AppShell>
  );
}
