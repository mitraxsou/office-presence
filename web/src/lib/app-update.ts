/** True when this phone should get one "Update the app" push for the published build. */
export function shouldNotifyAppUpdate(
  deviceVersionCode: number | null | undefined,
  publishedVersionCode: number | null | undefined,
  alreadyNotifiedCode: number | null | undefined,
): boolean {
  const published = publishedVersionCode ?? 0;
  if (published <= 0) return false;
  if (deviceVersionCode == null) return false;
  if (deviceVersionCode >= published) return false;
  if (alreadyNotifiedCode != null && alreadyNotifiedCode >= published) return false;
  return true;
}

export function downloadPageUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_ORIGIN?.trim() || "";
  const base = (configured || "https://office-presence-psi.vercel.app").replace(/\/$/, "");
  return `${base}/download`;
}

/** Mon-Fri 09:00-19:00 in the given IANA timezone. Hour 19 is excluded. */
export function inPresencePingWindow(now: Date, timeZone: string): boolean {
  let weekday = "";
  let hour = Number.NaN;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    hour = Number(parts.find((p) => p.type === "hour")?.value);
  } catch {
    return false;
  }
  if (weekday === "Sat" || weekday === "Sun") return false;
  return hour >= 9 && hour < 19;
}
