import { prisma } from "./db";
import { DEFAULT_RULES, type PresenceRules } from "./visit-calculator";

function toRules(row: {
  gapMinutes: number;
  dayHours: number;
  monthlyDaysTarget: number;
  monthlyPointsTarget: number;
  timezone: string;
  fenceRadiusMeters: number;
  sampleIntervalMinutes: number;
  correctionWindowDays?: number;
  correctionRequiresApproval?: boolean;
  correctionAutoApproveLimit?: number;
  correctionRequireSync?: boolean;
  correctionDailyDigest?: boolean;
  appVersionCode?: number;
  appVersionName?: string;
  appApkUrl?: string | null;
}): PresenceRules {
  return {
    gapMinutes: row.gapMinutes,
    dayHours: row.dayHours,
    monthlyDaysTarget: row.monthlyDaysTarget,
    monthlyPointsTarget: row.monthlyPointsTarget,
    timezone: row.timezone,
    fenceRadiusMeters: row.fenceRadiusMeters,
    sampleIntervalMinutes: row.sampleIntervalMinutes,
    correctionWindowDays: row.correctionWindowDays ?? DEFAULT_RULES.correctionWindowDays ?? 5,
    correctionRequiresApproval: row.correctionRequiresApproval === true,
    correctionAutoApproveLimit: row.correctionAutoApproveLimit ?? DEFAULT_RULES.correctionAutoApproveLimit ?? 4,
    correctionRequireSync: row.correctionRequireSync !== false,
    correctionDailyDigest: row.correctionDailyDigest !== false,
    appVersionCode: row.appVersionCode ?? 0,
    appVersionName: row.appVersionName ?? "",
    appApkUrl: row.appApkUrl ?? null,
  };
}

export async function getPolicy(): Promise<PresenceRules> {
  const row = await prisma.policy.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  return toRules(row);
}

export async function updatePolicy(
  input: Partial<PresenceRules> & { monthlyPointsTarget?: number },
): Promise<PresenceRules> {
  const row = await prisma.policy.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      gapMinutes: input.gapMinutes ?? DEFAULT_RULES.gapMinutes,
      dayHours: input.dayHours ?? DEFAULT_RULES.dayHours,
      monthlyDaysTarget: input.monthlyDaysTarget ?? DEFAULT_RULES.monthlyDaysTarget,
      monthlyPointsTarget: input.monthlyPointsTarget ?? DEFAULT_RULES.monthlyPointsTarget ?? 8,
      timezone: input.timezone ?? DEFAULT_RULES.timezone,
      fenceRadiusMeters: input.fenceRadiusMeters ?? DEFAULT_RULES.fenceRadiusMeters,
      sampleIntervalMinutes:
        input.sampleIntervalMinutes ?? DEFAULT_RULES.sampleIntervalMinutes ?? 5,
      correctionWindowDays: input.correctionWindowDays ?? DEFAULT_RULES.correctionWindowDays ?? 5,
      correctionRequiresApproval: input.correctionRequiresApproval === true,
      correctionAutoApproveLimit:
        input.correctionAutoApproveLimit ?? DEFAULT_RULES.correctionAutoApproveLimit ?? 4,
      correctionRequireSync: input.correctionRequireSync !== false,
      correctionDailyDigest: input.correctionDailyDigest !== false,
      appVersionCode: input.appVersionCode ?? DEFAULT_RULES.appVersionCode ?? 0,
      appVersionName: input.appVersionName ?? DEFAULT_RULES.appVersionName ?? "",
      appApkUrl: cleanApkUrl(input.appApkUrl),
    },
    update: {
      ...(input.gapMinutes != null ? { gapMinutes: input.gapMinutes } : {}),
      ...(input.dayHours != null ? { dayHours: input.dayHours } : {}),
      ...(input.monthlyDaysTarget != null
        ? { monthlyDaysTarget: input.monthlyDaysTarget }
        : {}),
      ...(input.monthlyPointsTarget != null
        ? { monthlyPointsTarget: input.monthlyPointsTarget }
        : {}),
      ...(input.timezone != null ? { timezone: input.timezone } : {}),
      ...(input.fenceRadiusMeters != null
        ? { fenceRadiusMeters: input.fenceRadiusMeters }
        : {}),
      ...(input.sampleIntervalMinutes != null
        ? { sampleIntervalMinutes: input.sampleIntervalMinutes }
        : {}),
      ...(input.correctionWindowDays != null
        ? { correctionWindowDays: input.correctionWindowDays }
        : {}),
      ...(typeof input.correctionRequiresApproval === "boolean"
        ? { correctionRequiresApproval: input.correctionRequiresApproval }
        : {}),
      ...(input.correctionAutoApproveLimit != null
        ? { correctionAutoApproveLimit: Math.max(0, Math.floor(input.correctionAutoApproveLimit)) }
        : {}),
      ...(typeof input.correctionRequireSync === "boolean"
        ? { correctionRequireSync: input.correctionRequireSync }
        : {}),
      ...(typeof input.correctionDailyDigest === "boolean"
        ? { correctionDailyDigest: input.correctionDailyDigest }
        : {}),
      ...(input.appVersionCode != null
        ? { appVersionCode: Math.max(0, Math.floor(input.appVersionCode)) }
        : {}),
      ...(input.appVersionName != null
        ? { appVersionName: input.appVersionName.trim().slice(0, 40) }
        : {}),
      ...(input.appApkUrl !== undefined ? { appApkUrl: cleanApkUrl(input.appApkUrl) } : {}),
    },
  });
  return toRules(row);
}

function cleanApkUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 2000) : null;
}
