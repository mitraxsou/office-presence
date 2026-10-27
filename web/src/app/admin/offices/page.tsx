import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Nav from "@/components/Nav";
import OfficesClient from "./OfficesClient";

export default async function OfficesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/me");
  return (
    <main>
      <Nav role="admin" active="/admin/offices" />
      <OfficesClient />
    </main>
  );
}
