import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPolicy } from "@/lib/policy";
import { prisma } from "@/lib/db";
import { dayKeyInTz } from "@/lib/visit-calculator";
import { OFFICE_TRACKER_SYNC_AUDIT_ACTION } from "@/lib/office-tracker-import";
import {
  readOfficeTrackerSyncAudit,
  type OfficeTrackerSyncCard,
} from "@/lib/office-tracker-sync-status";
import AppShell from "@/components/AppShell";
import SettingsClient from "./SettingsClient";

function lastAutomaticSync(row: { createdAt: Date; afterJson: unknown } | null): OfficeTrackerSyncCard | null {
  if (!row) return null;
  const summary = readOfficeTrackerSyncAudit(row.afterJson);
  return {
    dateLabel: summary.dayKey ?? dayKeyInTz(row.createdAt, "Asia/Kolkata"),
    daysAdded: summary.daysAdded,
    usersSkippedAppActive: summary.usersSkippedAppActive,
  };
}

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  const [policy, activeOffices, lastSyncRow] = await Promise.all([
    getPolicy(),
    prisma.officeLocation.count({ where: { status: "active" } }),
    prisma.auditLog.findFirst({
      where: { action: OFFICE_TRACKER_SYNC_AUDIT_ACTION },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, afterJson: true },
    }),
  ]);
  return (
    <AppShell role="admin" active="/admin/settings">
      <SettingsClient
        policy={{
          ...policy,
          monthlyPointsTarget: policy.monthlyPointsTarget ?? 8,
          correctionWindowDays: (policy as { correctionWindowDays?: number }).correctionWindowDays ?? 5,
        }}
        activeOffices={activeOffices}
        lastSync={lastAutomaticSync(lastSyncRow)}
      />
    </AppShell>
  );
}
