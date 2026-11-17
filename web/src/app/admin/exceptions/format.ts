const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parts(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dow };
}

/** "Fri 13 Nov" */
export function dayLabel(dayKey: string): string {
  const p = parts(dayKey);
  return `${WEEKDAY[p.dow]} ${p.d} ${MONTH[p.m - 1]}`;
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${y}`;
}

/** "Mon 2 to Fri 6 Nov", "Fri 13 Nov", "Whole month, November" */
export function rangeLabel(kind: string, startDay: string, endDay: string): string {
  if (kind === "month") return `Whole month, ${MONTH_LONG[parts(startDay).m - 1]}`;
  if (startDay === endDay) return dayLabel(startDay);
  const a = parts(startDay);
  const b = parts(endDay);
  const left = a.m === b.m && a.y === b.y ? `${WEEKDAY[a.dow]} ${a.d}` : dayLabel(startDay);
  return `${left} to ${dayLabel(endDay)}`;
}

export function pointsLabel(n: number): string {
  return `${n} ${n === 1 ? "point" : "points"}`;
}
