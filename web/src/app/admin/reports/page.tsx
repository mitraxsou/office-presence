import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Nav from "@/components/Nav";
import AdminReportsClient from "./AdminReportsClient";

export default async function AdminReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/me");
  return (
    <main>
      <Nav role="admin" active="/admin/reports" />
      <AdminReportsClient />
    </main>
  );
}
