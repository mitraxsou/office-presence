/** Mon-Fri 09:00-19:00 in the given IANA timezone. */
export function inPresencePingWindow(now: Date, timezone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  let hour = Number(hourRaw);
  // Some engines emit 24 for midnight.
  if (hour === 24) hour = 0;
  if (wd === "Sat" || wd === "Sun") return false;
  return hour >= 9 && hour < 19;
}
