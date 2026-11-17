import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import TeamCorrectionsClient from "./TeamCorrectionsClient";

export default async function TeamCorrectionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <AppShell role={session.role === "admin" ? "admin" : "user"} active="/team/corrections">
      <TeamCorrectionsClient />
    </AppShell>
  );
}
