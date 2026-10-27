import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import Nav from "@/components/Nav";
import UserSettingsClient from "./UserSettingsClient";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [user, policy] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    getPolicy(),
  ]);
  if (!user) redirect("/login");
  return (
    <main>
      <Nav role={session.role} active="/settings" />
      <UserSettingsClient
        initial={{
          developerMode: user.developerMode,
          sharePresenceWithPeers: user.sharePresenceWithPeers,
          timezone: user.timezone,
        }}
        policy={{
          monthlyPointsTarget: policy.monthlyPointsTarget ?? 8,
          dayHours: policy.dayHours,
          gapMinutes: policy.gapMinutes,
          timezone: policy.timezone,
          fenceRadiusMeters: policy.fenceRadiusMeters,
        }}
      />
    </main>
  );
}
