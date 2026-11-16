/** Settings card fields for the last automatic Office Tracker sync. */
export type OfficeTrackerSyncCard = {
  dateLabel: string;
  daysAdded: number;
  usersSkippedAppActive: number;
};

export const OFFICE_TRACKER_SYNC_EMPTY_LABEL = "No automatic sync yet.";

/** Read the last import.office_tracker_sync audit payload. */
export function readOfficeTrackerSyncAudit(afterJson: unknown): {
  dayKey: string | null;
  daysAdded: number;
  usersSkippedAppActive: number;
} {
  const after =
    afterJson && typeof afterJson === "object" && !Array.isArray(afterJson)
      ? (afterJson as Record<string, unknown>)
      : {};
  const counts =
    after.counts && typeof after.counts === "object" && !Array.isArray(after.counts)
      ? (after.counts as Record<string, unknown>)
      : {};
  const dayKey = typeof after.dayKey === "string" ? after.dayKey : null;
  const daysAdded = typeof after.visitsInserted === "number" ? after.visitsInserted : 0;
  const usersSkippedAppActive =
    typeof after.usersSkippedAppActive === "number"
      ? after.usersSkippedAppActive
      : typeof counts.usersSkippedAppActive === "number"
        ? counts.usersSkippedAppActive
        : 0;
  return { dayKey, daysAdded, usersSkippedAppActive };
}

export function formatOfficeTrackerSyncStatus(status: OfficeTrackerSyncCard): string {
  const days = status.daysAdded === 1 ? "1 day added" : `${status.daysAdded} days added`;
  const users =
    status.usersSkippedAppActive === 1
      ? "1 user skipped because the app is active"
      : `${status.usersSkippedAppActive} users skipped because the app is active`;
  return `Last automatic sync: ${status.dateLabel}. ${days}. ${users}.`;
}
