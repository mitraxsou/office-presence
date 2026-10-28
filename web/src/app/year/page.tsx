import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { greeting } from "@/lib/display-name";
import AppShell from "@/components/AppShell";
import YearClient from "./YearClient";

export default async function YearPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      firstName: true,
      lastName: true,
      preferredName: true,
      name: true,
      email: true,
      timezone: true,
      colleagueDisplayMode: true,
    },
  });
  if (!user) redirect("/login");

  const tz = user.timezone || "Asia/Kolkata";
  const now = new Date();

  return (
    <AppShell role={session.role} active="/year">
      <YearClient greetingText={greeting(user, now, tz)} />
    </AppShell>
  );
}
