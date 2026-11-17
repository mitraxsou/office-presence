import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import TeamMemberClient from "./TeamMemberClient";

type Props = { params: Promise<{ userId: string }> };

export default async function TeamMemberPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { userId } = await params;
  return (
    <AppShell role={session.role === "admin" ? "admin" : "user"} active="/team">
      <TeamMemberClient userId={userId} />
    </AppShell>
  );
}
