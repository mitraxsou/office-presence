const TZ = "Asia/Kolkata";

export function fmtTime(iso: string | null | undefined, timeZone = TZ) {
  if (!iso) return "-";
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return raw.toLowerCase().replace(/\u202f/g, " ");
}

export function fmtDateTime(iso: string | null | undefined, timeZone = TZ) {
  if (!iso) return "-";
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return raw.toLowerCase().replace(/\u202f/g, " ");
}

/** "2 h 32 m" */
export function fmtHours(h: number) {
  const mins = Math.max(0, Math.round(h * 60));
  return `${Math.floor(mins / 60)} h ${mins % 60} m`;
}

/** Duration from a past ISO timestamp to now. */
export function fmtDurationSince(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h ${m} m`;
}

export function fmtSince(iso: string | null | undefined, timeZone = TZ) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dayKey = (dt: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(dt);
  const today = dayKey(new Date());
  const that = dayKey(d);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const time = fmtTime(iso, timeZone);
  if (that === today) return time;
  if (that === yesterday) return `yesterday ${time}`;
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  return `${wd} ${time}`;
}

/** Relative sync label for devices. */
export function fmtSyncAgo(iso: string | null | undefined) {
  if (!iso) return "Never synced";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "Synced just now";
  if (mins < 60) return `Synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Synced ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `Last sync ${days} day${days === 1 ? "" : "s"} ago`;
}

export function monthTitle(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** "Wednesday 14 October" */
export function dayTitle(dayKey: string, timeZone = TZ) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(noon);
}

export function initials(name: string | null | undefined, email?: string | null) {
  const base = (name ?? "").trim() || (email ?? "").trim();
  if (!base) return "?";
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/** Last-seen labels for Users table: Today 12:13 pm, Yesterday 6:40 pm, Mon 26 Oct, Never. */
export function fmtLastSeen(iso: string | null | undefined, timeZone = TZ) {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Never";
  const dayKey = (dt: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(dt);
  const today = dayKey(new Date());
  const that = dayKey(d);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const time = fmtTime(iso, timeZone);
  if (that === today) return `Today ${time}`;
  if (that === yesterday) return `Yesterday ${time}`;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Calendar date for greetings: Tuesday 27 October */
export function fmtGreetingDate(now: Date = new Date(), timeZone = TZ) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

/** Format HH:MM (24h) as 9:00 pm. */
export function fmtClockHm(hm: string | null | undefined) {
  if (!hm || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hm)) return "";
  const [hStr, mStr] = hm.split(":");
  let h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
