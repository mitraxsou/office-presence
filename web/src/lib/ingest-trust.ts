import {
  haversineMeters,
  matchNearestOffice,
  type OfficeFenceInput,
  type PresenceRules,
} from "./visit-calculator";

export const FUTURE_SKEW_MS = 2 * 60_000;
export const MAX_AGE_MS = 30 * 24 * 3600_000;
export const CHECK_OUT_PAIR_WINDOW_MS = 10 * 60_000;

export type RejectReason =
  | "future"
  | "too_old"
  | "no_location"
  | "outside_office"
  | "unverified_check_in"
  | "client_office_mismatch"
  | "mock_location";

const REASON_LABELS: Record<string, string> = {
  future: "Time in the future",
  too_old: "Older than 30 days",
  no_location: "No location",
  outside_office: "Not at the office",
  unverified_check_in: "Unverified In",
  client_office_mismatch: "Office corrected by server",
  mock_location: "Mock GPS",
};

/** Admin tooltip text for a stored rejectReason. */
export function ignoreReasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? "Other";
}

export type IngestEventInput = {
  type: "enter" | "sample" | "exit" | "check_in" | "check_out";
  atMs: number;
  lat?: number | null;
  lng?: number | null;
  accuracyMeters?: number | null;
  /** Office the phone claimed (geofence id). Not authority by itself. */
  officeLocationId?: string | null;
  /** The phone reported a mock location provider. */
  mock?: boolean;
};

export type TrustDecision =
  | { skip: true; reason: "future" }
  | {
      skip: false;
      trusted: boolean;
      rejectReason: RejectReason | null;
      officeLocationId: string | null;
    };

export type TrustContext = {
  nowMs: number;
  /** True when the request came with a device token (not a view-as session). */
  fromDevice: boolean;
  offices: OfficeFenceInput[];
  rules: PresenceRules;
  /** check_out timestamps (ms) in this batch or stored in the last 10 minutes. */
  checkOutTimes: Set<number>;
  /** Trusted inside evidence (enter, sample, check_in) known so far: office id and time. */
  insideEvidence: { officeLocationId: string; atMs: number }[];
  /** Policy rejectMockLocations is on and the user is a real account (not test or dummy). */
  rejectMock?: boolean;
};

function hasCoords(e: IngestEventInput): e is IngestEventInput & { lat: number; lng: number } {
  return e.lat != null && e.lng != null && Number.isFinite(e.lat) && Number.isFinite(e.lng);
}

/** Window in which inside evidence must exist before a midnight check_in. */
export function checkInEvidenceWindowMs(rules: PresenceRules): number {
  const gapMs =
    rules.gapSeconds != null && rules.gapSeconds > 0 ? rules.gapSeconds * 1000 : rules.gapMinutes * 60_000;
  return gapMs + (rules.sampleIntervalMinutes ?? 5) * 60_000;
}

/**
 * Decide trust for one ingested event. Applied once at ingest and stored, so
 * a later recompute never changes old data.
 */
export function decideTrust(e: IngestEventInput, ctx: TrustContext): TrustDecision {
  if (e.atMs > ctx.nowMs + FUTURE_SKEW_MS) return { skip: true, reason: "future" };

  const activeById = new Map(ctx.offices.filter((o) => o.id).map((o) => [o.id as string, o]));
  const claimed = e.officeLocationId && activeById.has(e.officeLocationId) ? e.officeLocationId : null;
  const serverMatch = hasCoords(e)
    ? (matchNearestOffice(e.lat, e.lng, e.accuracyMeters, ctx.offices, ctx.rules)?.id ?? null)
    : null;

  let trusted = true;
  let reason: RejectReason | null = null;
  let officeLocationId: string | null = null;

  switch (e.type) {
    case "exit":
    case "check_out":
      officeLocationId = claimed ?? serverMatch;
      break;
    case "check_in": {
      officeLocationId = claimed ?? serverMatch;
      const window = checkInEvidenceWindowMs(ctx.rules);
      const paired = ctx.checkOutTimes.has(e.atMs);
      const evidence =
        officeLocationId != null &&
        ctx.insideEvidence.some(
          (x) => x.officeLocationId === officeLocationId && x.atMs <= e.atMs && e.atMs - x.atMs <= window,
        );
      if (!paired || !evidence) {
        trusted = false;
        reason = "unverified_check_in";
      }
      break;
    }
    case "enter":
    case "sample": {
      if (serverMatch) {
        officeLocationId = serverMatch;
        if (e.officeLocationId && e.officeLocationId !== serverMatch) reason = "client_office_mismatch";
      } else if (!hasCoords(e)) {
        trusted = false;
        reason = "no_location";
      } else {
        const office = claimed ? activeById.get(claimed) : undefined;
        const plausible =
          ctx.fromDevice &&
          office != null &&
          haversineMeters(e.lat, e.lng, office.lat, office.lng) <=
            office.radiusMeters + Math.max(0, e.accuracyMeters ?? 0);
        if (plausible) {
          officeLocationId = claimed;
        } else if (e.type === "enter" || e.officeLocationId) {
          // The calculator treats any enter, or any event with an office id, as inside.
          trusted = false;
          reason = "outside_office";
        }
        // A sample outside every office with no claim is normal evidence of being Out.
      }
      break;
    }
  }

  if (e.mock && ctx.rejectMock) {
    trusted = false;
    reason = "mock_location";
  } else if (ctx.nowMs - e.atMs > MAX_AGE_MS) {
    trusted = false;
    reason = "too_old";
  }

  return { skip: false, trusted, rejectReason: reason, officeLocationId: trusted ? officeLocationId : null };
}
