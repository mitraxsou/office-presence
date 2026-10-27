import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import CorrectionsClient from "./CorrectionsClient";

export default async function AdminCorrectionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  return (
    <AppShell role="admin" active="/admin/corrections">
      <CorrectionsClient adminUserId={session.id} />
    </AppShell>
  );
}
