import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { monthKeyInTz } from "@/lib/presence";
import AppShell from "@/components/AppShell";
import PersonVisitsClient, { type PersonVisitRow } from "./PersonVisitsClient";

function fmtClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .toLowerCase();
}

function fmtDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function fmtDuration(start: Date, end: Date | null): string {
  if (!end) return "Open";
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h ${m} m`;
}

function dayKeyInTz(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function initials(name: string | null, email: string): string {
  const n = (name || email).trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function fmtSince(iso: Date | null, tz: string): string {
  if (!iso) return "";
  const day = dayKeyInTz(iso, tz);
  const today = dayKeyInTz(new Date(), tz);
  const t = fmtClock(iso, tz);
  if (day === today) return t;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(iso)
    .replace(",", "")
    .toLowerCase();
}

export default async function PersonVisitsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  const { id } = await params;

  const policy = await getPolicy();
  const tz = policy.timezone;
  const monthKey = monthKeyInTz(new Date(), tz);
  const [y, m] = monthKey.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 1));
  const monthLabel = monthStart.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      status: true,
      deviceTokens: { where: { revokedAt: null }, select: { id: true, label: true } },
    },
  });
  if (!user) notFound();

  const [visits, corrections, reviewers] = await Promise.all([
    prisma.visit.findMany({
      where: { userId: id, startAt: { gte: new Date(Date.UTC(y - 1, 0, 1)) } },
      orderBy: { startAt: "desc" },
      take: 200,
    }),
    prisma.visitCorrectionRequest.findMany({
      where: { userId: id },
      select: {
        id: true,
        dayKey: true,
        status: true,
        reviewedById: true,
        reviewedAt: true,
      },
    }),
    prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const allOffices = await prisma.officeLocation.findMany({
    where: { status: "active" },
    select: { id: true, name: true, pointsPerVisitDay: true },
    orderBy: { name: "asc" },
  });
  const officeNames = new Map(allOffices.map((o) => [o.id, o.name]));
  const reviewerNames = new Map(
    reviewers.map((r) => [r.id, r.name || r.email]),
  );

  const pendingDays = new Set(
    corrections.filter((c) => c.status === "pending").map((c) => c.dayKey),
  );
  const approvedByDay = new Map(
    corrections
      .filter((c) => c.status === "approved")
      .map((c) => [c.dayKey, c] as const),
  );

  const monthVisits = visits.filter((v) => {
    const key = dayKeyInTz(v.startAt, tz);
    return key >= `${monthKey}-01` && key < dayKeyInTz(monthEnd, tz);
  });

  // Group by day for "Same day" secondary rows
  const byDay = new Map<string, typeof visits>();
  for (const v of visits) {
    const key = dayKeyInTz(v.startAt, tz);
    const list = byDay.get(key) ?? [];
    list.push(v);
    byDay.set(key, list);
  }

  const rows: PersonVisitRow[] = [];
  const seenDays = new Set<string>();
  for (const v of visits) {
    const dayKey = dayKeyInTz(v.startAt, tz);
    const dayList = byDay.get(dayKey) ?? [v];
    const isFirst = !seenDays.has(dayKey);
    seenDays.add(dayKey);
    const chron = [...dayList].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const primary = chron[0];
    const secondary = v.id !== primary.id;

    let tag: PersonVisitRow["tag"] = null;
    if (isFirst && pendingDays.has(dayKey)) tag = "pending";
    if (v.source === "correction" || (isFirst && approvedByDay.has(dayKey) && v.correctionId)) {
      tag = "corrected";
    }
    if (isFirst && (v.source === "admin" || v.editedBy) && tag !== "corrected") {
      tag = "edited";
    }

    let deviceLabel = "-";
    let deviceSub: string | null = null;
    if (v.source === "correction") {
      deviceLabel = "By request";
      const corr = approvedByDay.get(dayKey);
      const who = v.editedBy ? reviewerNames.get(v.editedBy) : corr?.reviewedById ? reviewerNames.get(corr.reviewedById) : null;
      const when = v.editedBy && corr?.reviewedAt
        ? corr.reviewedAt.toLocaleString("en-US", { day: "numeric", month: "short", timeZone: tz })
        : null;
      deviceSub = [who, when].filter(Boolean).join(", ") || null;
    } else {
      deviceLabel = user.deviceTokens[0]?.label || "Phone";
    }

    const points = secondary ? 0 : v.pointsAwarded;
    rows.push({
      id: v.id,
      dayKey,
      dayLabel: fmtDayLabel(dayKey),
      officeName: v.officeLocationId ? officeNames.get(v.officeLocationId) ?? null : null,
      officeId: v.officeLocationId,
      inLabel: fmtClock(v.startAt, tz),
      outLabel: v.endAt ? fmtClock(v.endAt, tz) : "-",
      inAt: v.startAt.toISOString(),
      outAt: v.endAt?.toISOString() ?? null,
      durationLabel: fmtDuration(v.startAt, v.endAt),
      countsAsLabel:
        secondary || points === 0
          ? secondary
            ? "Same day"
            : "0 days"
          : points === 1
            ? "1 day"
            : `${points} days`,
      deviceLabel,
      deviceSub,
      tag: secondary ? null : tag,
      secondary,
    });
  }

  const correctedCount = monthVisits.filter((v) => v.source === "correction" || v.correctionId).length;
  const pendingCount = [...pendingDays].filter((d) => d.startsWith(monthKey)).length;
  // unique visit days this month
  const visitDays = new Set(monthVisits.map((v) => dayKeyInTz(v.startAt, tz))).size;

  return (
    <AppShell role="admin" active="/admin/roster">
      <PersonVisitsClient
        userId={user.id}
        name={user.name ?? user.email}
        email={user.email}
        initials={initials(user.name, user.email)}
        officeName={user.status?.officeName ?? null}
        deviceCount={user.deviceTokens.length}
        inOffice={user.status?.inOffice ?? false}
        sinceLabel={fmtSince(user.status?.sinceAt ?? null, tz)}
        monthPoints={user.status?.monthPoints ?? 0}
        pointsTarget={policy.monthlyPointsTarget ?? 8}
        monthKey={monthKey}
        monthLabel={monthLabel}
        visitCount={visitDays}
        correctedCount={correctedCount}
        pendingCount={pendingCount}
        visits={rows}
        offices={allOffices}
        timezone={user.timezone || tz}
        firstName={(user.firstName || (user.name ?? "").split(/\s+/)[0] || "them").trim()}
        isOwnRecord={session.id === user.id}
      />
    </AppShell>
  );
}
