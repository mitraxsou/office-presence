import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { displayName, greeting, greetingName, parseColleagueDisplayMode } from "@/lib/display-name";
import AppShell from "@/components/AppShell";
import UserSettingsClient from "./UserSettingsClient";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [user, policy] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    getPolicy(),
  ]);
  if (!user) redirect("/login");

  const sp = (await searchParams) ?? {};
  const raw = String(sp.section ?? "profile");
  const section =
    raw === "notifications" ||
    raw === "sharing" ||
    raw === "appearance" ||
    raw === "nicknames" ||
    raw === "suggest"
      ? raw
      : "profile";

  const tz = user.timezone || policy.timezone || "Asia/Kolkata";

  return (
    <AppShell role={session.role} active="/settings">
      <UserSettingsClient
        section={section}
        viewAsReadonly={session.viewAsMode === "readonly"}
        viewAsName={session.adminId ? greetingName(user) : null}
        initial={{
          developerMode: user.developerMode,
          sharePresenceWithPeers: user.sharePresenceWithPeers,
          timezone: tz,
          email: user.email,
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          preferredName: user.preferredName ?? "",
          colleagueDisplayMode: parseColleagueDisplayMode(user.colleagueDisplayMode),
          displayName: displayName(user),
          greeting: greeting(user, new Date(), tz),
        }}
        policy={{
          monthlyPointsTarget: policy.monthlyPointsTarget ?? 8,
          dayHours: policy.dayHours,
          gapMinutes: policy.gapMinutes,
          timezone: policy.timezone,
          fenceRadiusMeters: policy.fenceRadiusMeters,
          correctionWindowDays: (policy as { correctionWindowDays?: number }).correctionWindowDays ?? 5,
        }}
      />
    </AppShell>
  );
}
