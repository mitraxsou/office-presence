import { prisma } from "./db";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Holiday day keys that apply to an office: rows for that office plus rows for every office (null). */
export async function holidayKeysForOffice(
  officeId: string | null,
  startDay: string,
  endDay: string,
): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({
    where: {
      dayKey: { gte: startDay, lte: endDay },
      OR: officeId ? [{ officeLocationId: null }, { officeLocationId: officeId }] : [{ officeLocationId: null }],
    },
    select: { dayKey: true },
  });
  return new Set(rows.map((r) => r.dayKey));
}

/** Holidays for a person's home office in a range, with names. */
export async function holidaysForOffice(officeId: string | null, startDay: string, endDay: string) {
  return prisma.holiday.findMany({
    where: {
      dayKey: { gte: startDay, lte: endDay },
      OR: officeId ? [{ officeLocationId: null }, { officeLocationId: officeId }] : [{ officeLocationId: null }],
    },
    orderBy: { dayKey: "asc" },
    select: { id: true, dayKey: true, name: true, officeLocationId: true },
  });
}

export type HolidayCsvRow = { line: number; dayKey: string; name: string; officeName: string | null };
export type HolidayCsvProblem = { line: number; error: string };

/** CSV: date,name[,office]. Blank office means every office. Header row optional. */
export function parseHolidayCsv(text: string): { rows: HolidayCsvRow[]; problems: HolidayCsvProblem[] } {
  const rows: HolidayCsvRow[] = [];
  const problems: HolidayCsvProblem[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const cells = splitCsvLine(trimmed);
    const [date = "", name = "", office = ""] = cells.map((c) => c.trim());
    if (i === 0 && date.toLowerCase() === "date") return;
    if (!DAY_RE.test(date)) {
      problems.push({ line, error: "Date must be YYYY-MM-DD" });
      return;
    }
    if (!name) {
      problems.push({ line, error: "Name is missing" });
      return;
    }
    rows.push({ line, dayKey: date, name: name.slice(0, 120), officeName: office || null });
  });
  return { rows, problems };
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
