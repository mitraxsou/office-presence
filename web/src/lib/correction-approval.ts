/** Pure rules for auto approve vs pending. The route trusts this, not the app. */

export type CorrectionOutcome = "auto_approved" | "pending";

export type ClassifyInput = {
  requiresApproval: boolean;
  isAdminSelf: boolean;
  autoApprovedThisMonth: number;
  limit: number;
  requireSync: boolean;
  hasPhoneData: boolean;
};

export type ClassifyResult = {
  outcome: CorrectionOutcome;
  reason: string | null;
};

export function classifyCorrection(input: ClassifyInput): ClassifyResult {
  if (input.requiresApproval) {
    return { outcome: "pending", reason: "An admin approves this one." };
  }
  if (input.isAdminSelf) {
    return {
      outcome: "pending",
      reason: "Admins cannot auto approve their own corrections.",
    };
  }
  const limit = Math.max(0, Math.floor(input.limit));
  if (input.autoApprovedThisMonth >= limit) {
    return { outcome: "pending", reason: `Over ${limit} this month.` };
  }
  if (input.requireSync && !input.hasPhoneData) {
    return { outcome: "pending", reason: "No phone data that day." };
  }
  return { outcome: "auto_approved", reason: null };
}

export type VisitTime = { inAt: string | null; outAt: string | null };

/** Returns an error when a set time is after now. Null out means Still In. */
export function futureTimeError(visits: VisitTime[], now: Date): string | null {
  const nowMs = now.getTime();
  for (const v of visits) {
    for (const raw of [v.inAt, v.outAt]) {
      if (raw == null || raw === "") continue;
      const ms = new Date(raw).getTime();
      if (Number.isNaN(ms)) return "Valid in and out times required";
      if (ms > nowMs) return "Times cannot be later than now";
    }
  }
  return null;
}

export function buttonLabel(outcome: CorrectionOutcome, surface: "today" | "review"): string {
  if (outcome === "pending") return "Send for approval";
  return surface === "today" ? "Save changes" : "Save correction";
}
