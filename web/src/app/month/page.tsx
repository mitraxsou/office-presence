import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { greeting, greetingName } from "@/lib/display-name";
import { fmtGreetingDate } from "@/lib/format";
import AppShell from "@/components/AppShell";
import MeClient from "../me/MeClient";

export default async function MonthPage() {
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
    <AppShell role={session.role} active="/month">
      <MeClient
        name={session.name ?? session.email}
        greetingText={greeting(user, now, tz)}
        greetingDate={fmtGreetingDate(now, tz)}
        viewAs={
          session.adminId && session.viewAsMode
            ? {
                mode: session.viewAsMode,
                name: greetingName(user),
              }
            : null
        }
      />
    </AppShell>
  );
}
