import { prisma } from "./db";
import { DEFAULT_RULES, type PresenceRules } from "./visit-calculator";

export async function getPolicy(): Promise<PresenceRules> {
  const row = await prisma.policy.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  return {
    gapMinutes: row.gapMinutes,
    dayHours: row.dayHours,
    monthlyDaysTarget: row.monthlyDaysTarget,
    monthlyPointsTarget: row.monthlyPointsTarget,
    timezone: row.timezone,
    fenceRadiusMeters: row.fenceRadiusMeters,
    sampleIntervalMinutes: row.sampleIntervalMinutes,
  };
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
    },
  });
  return {
    gapMinutes: row.gapMinutes,
    dayHours: row.dayHours,
    monthlyDaysTarget: row.monthlyDaysTarget,
    monthlyPointsTarget: row.monthlyPointsTarget,
    timezone: row.timezone,
    fenceRadiusMeters: row.fenceRadiusMeters,
    sampleIntervalMinutes: row.sampleIntervalMinutes,
  };
}
