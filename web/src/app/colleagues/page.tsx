import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import PeersClient from "../peers/PeersClient";

export default async function ColleaguesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Admin-only (SPEC §18). View-as uses the target role, so non-admins are redirected.
  if (session.role !== "admin") redirect("/month");
  return (
    <AppShell role={session.role} active="/colleagues">
      <PeersClient />
    </AppShell>
  );
}
