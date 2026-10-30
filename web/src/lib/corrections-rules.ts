export function isMonthLocked(dayKey: string, windowDays: number, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return true;
  const [y, m] = dayKey.split("-").map(Number);
  const lockAt = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  lockAt.setUTCDate(lockAt.getUTCDate() + windowDays);
  return now.getTime() > lockAt.getTime();
}

/** Sole active admin may decide their own correction requests. */
export function canDecideOwnCorrection(activeAdminCount: number): boolean {
  return activeAdminCount === 1;
}

export type KeptVisitSource = "auto" | "manual" | "admin" | "correction";

export type KeptDayRows = {
  visits: Array<{
    id: string;
    startAt: string;
    endAt: string;
    source: KeptVisitSource;
    reason: string | null;
    editedBy: string | null;
    officeLocationId: string | null;
    pointsAwarded: number;
    correctionId: string | null;
  }>;
  exclusions: Array<{
    id: string;
    startAt: string;
    endAt: string;
    reason: string | null;
  }>;
  fragmentVisitIds: string[];
  fragmentExclusionIds: string[];
};

export function emptyKept(): KeptDayRows {
  return { visits: [], exclusions: [], fragmentVisitIds: [], fragmentExclusionIds: [] };
}

function isKeptSource(value: unknown): value is KeptVisitSource {
  return value === "auto" || value === "manual" || value === "admin" || value === "correction";
}

/** Rows removed while replacing one day, so undo and revert can put them back. */
export function readKeptDayRows(applied: unknown): KeptDayRows | null {
  if (!applied || typeof applied !== "object" || Array.isArray(applied) || !("_kept" in applied)) return null;
  const kept = (applied as { _kept?: unknown })._kept;
  if (!kept || typeof kept !== "object" || Array.isArray(kept)) return null;
  const raw = kept as Record<string, unknown>;
  if (!Array.isArray(raw.visits) || !Array.isArray(raw.exclusions)) return null;
  const visits = raw.visits.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const v = item as Record<string, unknown>;
    if (typeof v.id !== "string" || typeof v.startAt !== "string" || typeof v.endAt !== "string") return [];
    if (!isKeptSource(v.source)) return [];
    return [{
      id: v.id,
      startAt: v.startAt,
      endAt: v.endAt,
      source: v.source,
      reason: typeof v.reason === "string" ? v.reason : null,
      editedBy: typeof v.editedBy === "string" ? v.editedBy : null,
      officeLocationId: typeof v.officeLocationId === "string" ? v.officeLocationId : null,
      pointsAwarded: typeof v.pointsAwarded === "number" ? v.pointsAwarded : 0,
      correctionId: typeof v.correctionId === "string" ? v.correctionId : null,
    }];
  });
  const exclusions = raw.exclusions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const e = item as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.startAt !== "string" || typeof e.endAt !== "string") return [];
    return [{
      id: e.id,
      startAt: e.startAt,
      endAt: e.endAt,
      reason: typeof e.reason === "string" ? e.reason : null,
    }];
  });
  const ids = (value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  return {
    visits,
    exclusions,
    fragmentVisitIds: ids(raw.fragmentVisitIds),
    fragmentExclusionIds: ids(raw.fragmentExclusionIds),
  };
}

export function withKeptDayRows(applied: unknown, kept: KeptDayRows): Record<string, unknown> {
  if (applied && typeof applied === "object" && !Array.isArray(applied)) {
    return { ...(applied as Record<string, unknown>), _kept: kept };
  }
  return { _kept: kept };
}

/** Keep the parts of an interval outside one local-day replacement range. */
export function retainOutsideRange(
  start: Date,
  end: Date,
  removeStart: Date,
  removeEnd: Date,
): Array<{ startAt: Date; endAt: Date }> {
  const retained = [
    ...(start < removeStart
      ? [{ startAt: start, endAt: new Date(Math.min(end.getTime(), removeStart.getTime())) }]
      : []),
    ...(end > removeEnd
      ? [{ startAt: new Date(Math.max(start.getTime(), removeEnd.getTime())), endAt: end }]
      : []),
  ];
  return retained.filter((part) => part.endAt > part.startAt);
}
