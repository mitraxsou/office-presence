import type { RequestedSnapshot, VisitRequest } from "@/lib/corrections";

export type ParsedCorrectionRequest =
  | {
      ok: true;
      requested: RequestedSnapshot;
      proposedStart: Date;
      proposedEnd: Date;
      officeLocationId: string | null;
      /** Every office id the request names, for an active-office check. */
      officeIds: string[];
    }
  | { ok: false; error: string };

type RawVisit = { office_id?: unknown; in_at?: unknown; out_at?: unknown };

/** Blank or unparsed times keep the required-times error. A real pair out of order does not. */
export function visitTimeError(start: Date, outAt: string | null): string | null {
  if (Number.isNaN(start.getTime())) return "Valid in_at and out_at required";
  if (!outAt) return null;
  const end = new Date(outAt);
  if (Number.isNaN(end.getTime())) return "Valid in_at and out_at required";
  if (end.getTime() <= start.getTime()) return "Out must be after In";
  return null;
}

function officeIdOf(raw: unknown): string | null {
  if (raw == null) return null;
  const id = String(raw).trim();
  return id && id !== "null" && id !== "unknown" ? id : null;
}

/** Offices named on a correction. A visits list keeps every office, not only the first. */
export function officeIdsOnRequest(requested: { remove?: unknown; visits?: unknown; office_id?: unknown }): string[] {
  if (requested.remove === true) return [];
  if (Array.isArray(requested.visits)) {
    const ids = requested.visits.map((v) => officeIdOf((v as RawVisit)?.office_id));
    return [...new Set(ids.filter((id): id is string => id != null))];
  }
  const one = officeIdOf(requested.office_id);
  return one ? [one] : [];
}

/**
 * Preview query. `office_ids` is the Fix today list. A single `office_id` is the Month wrong-office pick.
 * Blank, "null", and "unknown" are dropped. Duplicates count once.
 */
export function officeIdsFromQuery(officeIds: string | null, officeId: string | null): string[] {
  const many = (officeIds ?? "")
    .split(",")
    .map((s) => officeIdOf(s))
    .filter((id): id is string => id != null);
  if (many.length) return [...new Set(many)];
  const one = officeIdOf(officeId);
  return one ? [one] : [];
}

/** A corrected day counts as the highest office weight on that day. No office counts as 0. */
export function pointsForCorrectionOffices(weights: number[]): number {
  if (weights.length === 0) return 0;
  return weights.reduce((max, n) => (n > max ? n : max), 0);
}

function outOf(raw: unknown): string | null {
  return raw == null || raw === "" ? null : String(raw);
}

/**
 * Reads the correction body. `requested.visits` wins over the single in_at / out_at pair so a
 * multi-visit Fix today keeps every visit and each visit's office.
 */
export function parseCorrectionRequest(
  body: { issue?: unknown; requested?: unknown; proposedStart?: unknown; proposedEnd?: unknown; officeLocationId?: unknown },
  dayKey: string,
): ParsedCorrectionRequest {
  const req = (body.requested ?? {}) as { remove?: unknown; visits?: unknown } & RawVisit;
  if (String(body.issue ?? "") === "should_not_count" || req.remove === true) {
    return {
      ok: true,
      requested: { remove: true },
      proposedStart: new Date(`${dayKey}T00:00:00.000Z`),
      proposedEnd: new Date(`${dayKey}T00:01:00.000Z`),
      officeLocationId: null,
      officeIds: [],
    };
  }

  if (Array.isArray(req.visits) && req.visits.length > 0) {
    const visits: VisitRequest[] = [];
    for (const raw of req.visits as RawVisit[]) {
      const start = new Date(String(raw?.in_at ?? ""));
      const outAt = outOf(raw?.out_at);
      const error = visitTimeError(start, outAt);
      if (error) return { ok: false, error };
      visits.push({
        office_id: officeIdOf(raw?.office_id),
        in_at: start.toISOString(),
        out_at: outAt ? new Date(outAt).toISOString() : null,
      });
    }
    visits.sort((a, b) => Date.parse(a.in_at) - Date.parse(b.in_at));
    for (let i = 0; i < visits.length; i++) {
      const v = visits[i];
      if (v.out_at == null && i !== visits.length - 1) {
        return { ok: false, error: "Only the last visit can be Still In" };
      }
      const prev = visits[i - 1];
      if (prev?.out_at && Date.parse(v.in_at) < Date.parse(prev.out_at)) {
        return { ok: false, error: "Visits cannot overlap" };
      }
    }
    const first = visits[0];
    return {
      ok: true,
      requested: { visits },
      proposedStart: new Date(first.in_at),
      proposedEnd: new Date(first.out_at ?? first.in_at),
      officeLocationId: first.office_id,
      officeIds: [...new Set(visits.map((v) => v.office_id).filter((id): id is string => id != null))],
    };
  }

  const start = new Date(String(req.in_at ?? body.proposedStart ?? ""));
  const outAt = outOf(req.out_at ?? body.proposedEnd);
  const error = visitTimeError(start, outAt);
  if (error) return { ok: false, error };
  const officeLocationId = officeIdOf(req.office_id ?? body.officeLocationId);
  return {
    ok: true,
    requested: {
      office_id: officeLocationId,
      in_at: start.toISOString(),
      out_at: outAt ? new Date(outAt).toISOString() : null,
    },
    proposedStart: start,
    proposedEnd: outAt ? new Date(outAt) : start,
    officeLocationId,
    officeIds: officeLocationId ? [officeLocationId] : [],
  };
}
