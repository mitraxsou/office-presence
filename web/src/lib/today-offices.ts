import { dayKeyInTz } from "@/lib/visit-calculator";

export type TodayOfficeVisit = {
  startAt: Date;
  endAt: Date | null;
  officeLocationId: string | null;
};

export type TodayOfficeGroup = {
  office_id: string | null;
  name: string;
  minutes: number;
  visits: Array<{ in_at: string; out_at: string; minutes: number }>;
};

/** Group visits whose local start day is todayKey. One group per office. */
export function groupTodayOffices(
  visits: TodayOfficeVisit[],
  todayKey: string,
  tz: string,
  names: Map<string, string>,
  nowMs: number = Date.now(),
): TodayOfficeGroup[] {
  const order: string[] = [];
  const map = new Map<string, TodayOfficeGroup>();
  for (const v of [...visits].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    if (dayKeyInTz(v.startAt, tz) !== todayKey) continue;
    const key = v.officeLocationId || "unknown";
    let g = map.get(key);
    if (!g) {
      g = {
        office_id: v.officeLocationId,
        name: (v.officeLocationId && names.get(v.officeLocationId)) || "Office",
        minutes: 0,
        visits: [],
      };
      map.set(key, g);
      order.push(key);
    }
    const endMs = v.endAt?.getTime() ?? nowMs;
    const mins = Math.max(0, Math.round((endMs - v.startAt.getTime()) / 60_000));
    g.minutes += mins;
    g.visits.push({
      in_at: v.startAt.toISOString(),
      out_at: (v.endAt ?? new Date(endMs)).toISOString(),
      minutes: mins,
    });
  }
  return order.map((k) => map.get(k)!);
}
