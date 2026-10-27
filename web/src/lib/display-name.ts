export type ColleagueDisplayMode = "first_last" | "preferred_last" | "preferred_only";

export type NameParts = {
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  colleagueDisplayMode?: string | null;
  name?: string | null;
  email?: string | null;
};

const MODES: ColleagueDisplayMode[] = ["first_last", "preferred_last", "preferred_only"];

export function parseColleagueDisplayMode(raw: unknown): ColleagueDisplayMode {
  const s = String(raw ?? "first_last");
  return (MODES as string[]).includes(s) ? (s as ColleagueDisplayMode) : "first_last";
}

function clean(part: string | null | undefined): string {
  return (part ?? "").trim();
}

function fallbackLabel(user: NameParts): string {
  const legacy = clean(user.name);
  if (legacy) return legacy;
  const email = clean(user.email);
  if (email.includes("@")) return email.split("@")[0] ?? email;
  return email || "Colleague";
}

/** Greeting name: preferred name, else first name, else legacy name / email local-part. */
export function greetingName(user: NameParts): string {
  const preferred = clean(user.preferredName);
  if (preferred) return preferred;
  const first = clean(user.firstName);
  if (first) return first;
  return fallbackLabel(user);
}

/** Colleague-facing display name from profile mode. */
export function displayName(user: NameParts): string {
  const mode = parseColleagueDisplayMode(user.colleagueDisplayMode);
  const first = clean(user.firstName);
  const last = clean(user.lastName);
  const preferred = clean(user.preferredName);

  if (mode === "preferred_only") {
    if (preferred) return preferred;
    if (first) return first;
    return fallbackLabel(user);
  }

  if (mode === "preferred_last") {
    const left = preferred || first;
    if (left && last) return `${left} ${last}`;
    if (left) return left;
    if (last) return last;
    return fallbackLabel(user);
  }

  // first_last
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return fallbackLabel(user);
}

/** Compose legacy `name` from first + last for older callers. */
export function composeFullName(firstName?: string | null, lastName?: string | null): string | null {
  const first = clean(firstName);
  const last = clean(lastName);
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return null;
}

export type DayPart = "morning" | "afternoon" | "evening";

/** Morning before 12:00, afternoon 12:00 to 17:00, evening after 17:00. */
export function dayPartFor(now: Date, timeZone = "Asia/Kolkata"): DayPart {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = Number(hourStr);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function greeting(user: NameParts, now: Date = new Date(), timeZone = "Asia/Kolkata"): string {
  const part = dayPartFor(now, timeZone);
  const label = part === "morning" ? "Good morning" : part === "afternoon" ? "Good afternoon" : "Good evening";
  return `${label}, ${greetingName(user)}`;
}
