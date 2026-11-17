import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { adminRoster } from "@/lib/roster";
import { csvResponse, toCsv } from "@/lib/export-csv";
import { getPolicy } from "@/lib/policy";
import { monthKeyInTz } from "@/lib/presence";
import { monthRecordCounts } from "@/lib/month-records";
import { monthDayRange } from "@/lib/exception-days";
import { holidaysForOffice } from "@/lib/holidays";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const sp = new URL(request.url).searchParams;
  const kind = (sp.get("kind") ?? "").trim().toLowerCase();
  if (!["roster", "reports", "person"].includes(kind)) {
    return Response.json({ error: "kind must be roster, reports, or person" }, { status: 400 });
  }

  const office = sp.get("office")?.trim() || undefined;
  const userId = sp.get("userId")?.trim() || undefined;
  const monthParam = sp.get("month")?.trim() || undefined;
  const policy = await getPolicy();
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : monthKeyInTz(new Date(), policy.timezone);

  if (kind === "roster") {
    const roster = await adminRoster({ office });
    const headers = [
      "email",
      "name",
      "role",
      "inOffice",
      "officeName",
      "sinceAt",
      "monthPoints",
      "monthVisitDays",
      "monthDays",
      "hoursToday",
      "lastDeviceName",
      "noRecentSync",
      "lastEvidenceAt",
    ];
    const rows = roster.users.map((u) => [
      u.email,
      u.name,
      u.role,
      u.inOffice,
      u.officeName,
      u.sinceAt,
      u.monthPoints,
      u.monthVisitDays,
      u.monthDays,
      u.hoursToday,
      u.lastDeviceName,
      u.noRecentSync,
      u.lastEvidenceAt,
    ]);
    return csvResponse(toCsv(headers, rows), `roster-${month}.csv`);
  }

  if (kind === "reports") {
    const roster = await adminRoster({ office });
    const records = await monthRecordCounts(
      roster.users.map((u) => ({ id: u.id, homeOfficeId: u.homeOfficeId ?? null })),
      month,
    );
    const headers = [
      "email",
      "name",
      "monthPoints",
      "monthVisitDays",
      "hoursToday",
      "met",
      "lastDeviceName",
      "officeName",
      "exceptionDays",
      "exceptionPoints",
      "leaveDays",
      "holidays",
    ];
    const rows = roster.users.map((u) => {
      const r = records.get(u.id);
      return [
        u.email,
        u.name,
        u.monthPoints,
        u.monthVisitDays,
        u.hoursToday,
        u.monthPoints >= roster.pointsTarget,
        u.lastDeviceName,
        u.officeName,
        r?.exceptionDays ?? 0,
        r?.exceptionPoints ?? 0,
        r?.leaveDays ?? 0,
        r?.holidays ?? 0,
      ];
    });
    return csvResponse(toCsv(headers, rows), `reports-${month}.csv`);
  }

  // kind === "person"
  if (!userId) {
    return Response.json({ error: "userId required for kind=person" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, homeOfficeId: true },
  });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });

  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const visits = await prisma.visit.findMany({
    where: { userId, startAt: { gte: start, lt: end } },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      source: true,
      reason: true,
      officeLocationId: true,
      pointsAwarded: true,
    },
  });
  const officeIds = [...new Set(visits.map((v) => v.officeLocationId).filter(Boolean))] as string[];
  const offices = officeIds.length
    ? await prisma.officeLocation.findMany({
        where: { id: { in: officeIds } },
        select: { id: true, name: true },
      })
    : [];
  const officeNames = new Map(offices.map((o) => [o.id, o.name]));

  const headers = [
    "email",
    "name",
    "visitId",
    "startAt",
    "endAt",
    "source",
    "officeName",
    "pointsAwarded",
    "reason",
  ];
  const rows = visits.map((v) => [
    user.email,
    user.name,
    v.id,
    v.startAt.toISOString(),
    v.endAt?.toISOString() ?? "",
    v.source,
    v.officeLocationId ? officeNames.get(v.officeLocationId) ?? "" : "",
    v.pointsAwarded,
    v.reason,
  ]);
  const { startDay, endDay } = monthDayRange(month);
  const [exceptionDays, leaveDays, holidays] = await Promise.all([
    prisma.presenceExceptionDay.findMany({
      where: { userId, dayKey: { gte: startDay, lte: endDay }, exception: { revokedAt: null } },
      include: { exception: { select: { id: true, reason: true } } },
      orderBy: { dayKey: "asc" },
    }),
    prisma.leaveDay.findMany({ where: { userId, dayKey: { gte: startDay, lte: endDay } }, orderBy: { dayKey: "asc" } }),
    holidaysForOffice(user.homeOfficeId, startDay, endDay),
  ]);
  for (const d of exceptionDays) {
    rows.push([user.email, user.name, d.exception.id, d.dayKey, "", "hr_exception", "", d.points, d.exception.reason]);
  }
  for (const l of leaveDays) {
    rows.push([user.email, user.name, "", l.dayKey, "", l.kind, "", 0, l.note ?? ""]);
  }
  for (const h of holidays) {
    rows.push([user.email, user.name, "", h.dayKey, "", "holiday", "", 0, h.name]);
  }
  const safeEmail = user.email.replace(/[^a-zA-Z0-9._-]/g, "_");
  return csvResponse(toCsv(headers, rows), `person-${safeEmail}-${month}.csv`);
}
