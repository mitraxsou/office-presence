const TZ = "Asia/Kolkata";

export function fmtTime(iso: string | null | undefined, timeZone = TZ) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined, timeZone = TZ) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function fmtHours(h: number) {
  const mins = Math.round(h * 60);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function fmtSince(iso: string | null | undefined, timeZone = TZ) {
  if (!iso) return "-";
  const d = new Date(iso);
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  return sameDay ? fmtTime(iso, timeZone) : fmtDateTime(iso, timeZone);
}
