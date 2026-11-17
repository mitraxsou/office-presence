import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import TeamClient from "./TeamClient";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <AppShell role={session.role === "admin" ? "admin" : "user"} active="/team">
      <TeamClient />
    </AppShell>
  );
}
