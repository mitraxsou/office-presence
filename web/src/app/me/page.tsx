import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Nav from "@/components/Nav";
import MeClient from "./MeClient";

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <main>
      <Nav role={session.role} active="/me" />
      <MeClient name={session.name ?? session.email} />
    </main>
  );
}
