import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import OfficesClient from "./OfficesClient";

export default async function OfficesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  return (
    <AppShell role="admin" active="/admin/offices">
      <OfficesClient />
    </AppShell>
  );
}
