import type { PresenceRules } from "./visit-calculator";

/** Tracking consent (privacy notice). Separate from colleague sharing (/api/me/privacy). */
export type ConsentUser = {
  privacyConsentVersion?: string | null;
  privacyConsentAt?: Date | null;
};

export function requiredNoticeVersion(rules: Pick<PresenceRules, "privacyNoticeVersion">): string {
  return rules.privacyNoticeVersion || "1";
}

export function hasAcceptedCurrent(user: ConsentUser, rules: Pick<PresenceRules, "privacyNoticeVersion">): boolean {
  return user.privacyConsentVersion != null && user.privacyConsentVersion === requiredNoticeVersion(rules);
}

/** Ingest gate: only enforced when the policy requires consent. */
export function hasCurrentConsent(
  user: ConsentUser,
  rules: Pick<PresenceRules, "privacyNoticeVersion" | "requireConsent">,
): boolean {
  if (rules.requireConsent !== true) return true;
  return hasAcceptedCurrent(user, rules);
}

export function consentState(
  user: ConsentUser,
  rules: Pick<PresenceRules, "privacyNoticeVersion" | "requireConsent" | "rawLocationRetentionDays">,
) {
  return {
    requiredVersion: requiredNoticeVersion(rules),
    acceptedVersion: user.privacyConsentVersion ?? null,
    acceptedAt: user.privacyConsentAt?.toISOString() ?? null,
    accepted: hasAcceptedCurrent(user, rules),
    required: rules.requireConsent === true,
    retentionDays: rules.rawLocationRetentionDays ?? 90,
    noticeUrl: "/privacy",
  };
}
