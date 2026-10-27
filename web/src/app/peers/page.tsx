import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Nav from "@/components/Nav";
import PeersClient from "./PeersClient";

export default async function PeersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <main>
      <Nav role={session.role} active="/peers" />
      <PeersClient />
    </main>
  );
}
