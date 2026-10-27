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
    },
  });
  return toRules(row);
}
