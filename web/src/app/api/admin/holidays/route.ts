import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { isMonthLocked } from "@/lib/corrections-rules";
import { isDayKey } from "@/lib/exceptions";
import { parseHolidayCsv } from "@/lib/holidays";

async function admin() {
  try {
    return await requireAdmin();
  } catch (res) {
    return res as Response;
  }
}

export async function GET(request: Request) {
  const a = await admin();
  if (a instanceof Response) return a;
  const yearRaw = new URL(request.url).searchParams.get("year");
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : String(new Date().getUTCFullYear());
  const [rows, offices] = await Promise.all([
    prisma.holiday.findMany({
      where: { dayKey: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
      orderBy: [{ dayKey: "asc" }, { name: "asc" }],
    }),
    prisma.officeLocation.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const officeName = new Map(offices.map((o) => [o.id, o.name]));
  return NextResponse.json({
    year,
    offices,
    holidays: rows.map((h) => ({
      id: h.id,
      dayKey: h.dayKey,
      name: h.name,
      officeLocationId: h.officeLocationId,
      officeName: h.officeLocationId ? officeName.get(h.officeLocationId) ?? "Office" : null,
    })),
  });
}

/** Add one holiday (one row per office, or one row for every office), or import a CSV with dryRun. */
export async function POST(request: Request) {
  const a = await admin();
  if (a instanceof Response) return a;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (typeof body.csv === "string") {
    const dryRun = body.dryRun !== false;
    const parsed = parseHolidayCsv(body.csv);
    const offices = await prisma.officeLocation.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    const byName = new Map(offices.map((o) => [o.name.trim().toLowerCase(), o.id]));
    const problems = [...parsed.problems];
    const ready: Array<{ dayKey: string; name: string; officeLocationId: string | null }> = [];
    for (const row of parsed.rows) {
      if (!isDayKey(row.dayKey)) {
        problems.push({ line: row.line, error: "Date is not a real day" });
        continue;
      }
      const officeLocationId = row.officeName ? byName.get(row.officeName.toLowerCase()) ?? undefined : null;
      if (officeLocationId === undefined) {
        problems.push({ line: row.line, error: `Unknown office "${row.officeName}"` });
        continue;
      }
      ready.push({ dayKey: row.dayKey, name: row.name, officeLocationId });
    }
    let created = 0;
    if (!dryRun) {
      for (const h of ready) {
        const exists = await prisma.holiday.findFirst({
          where: { dayKey: h.dayKey, officeLocationId: h.officeLocationId },
        });
        if (exists) continue;
        await prisma.holiday.create({ data: { ...h, createdById: a.id } });
        created += 1;
      }
      await prisma.auditLog.create({
        data: { actorId: a.id, action: "holiday.import", targetType: "holiday", afterJson: { rows: ready.length, created } },
      });
    }
    return NextResponse.json({ dryRun, rows: ready.length, created, problems });
  }

  const dayKey = typeof body.dayKey === "string" ? body.dayKey : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!isDayKey(dayKey)) return NextResponse.json({ error: "Choose a date" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Add a name" }, { status: 400 });
  const officeIds = Array.isArray(body.officeIds)
    ? [...new Set(body.officeIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  const targets: Array<string | null> = officeIds.length ? officeIds : [null];
  const rows = [];
  for (const officeLocationId of targets) {
    const exists = await prisma.holiday.findFirst({ where: { dayKey, officeLocationId } });
    rows.push(
      exists
        ? await prisma.holiday.update({ where: { id: exists.id }, data: { name } })
        : await prisma.holiday.create({ data: { dayKey, name, officeLocationId, createdById: a.id } }),
    );
  }
  await prisma.auditLog.create({
    data: {
      actorId: a.id,
      action: "holiday.create",
      targetType: "holiday",
      targetId: dayKey,
      afterJson: { dayKey, name, officeIds: targets },
    },
  });
  return NextResponse.json({ ok: true, holidays: rows });
}

/** Delete by ids. Blocked for a locked month. */
export async function DELETE(request: Request) {
  const a = await admin();
  if (a instanceof Response) return a;
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : url.searchParams.get("id")
      ? [url.searchParams.get("id")!]
      : [];
  if (!ids.length) return NextResponse.json({ error: "id required" }, { status: 400 });
  const rows = await prisma.holiday.findMany({ where: { id: { in: ids } } });
  const policy = await getPolicy();
  const locked = rows.find((h) => isMonthLocked(h.dayKey, policy.correctionWindowDays ?? 5, new Date(), policy.timezone));
  if (locked) {
    return NextResponse.json({ error: "This month is closed. Holidays in closed months cannot be deleted." }, { status: 400 });
  }
  await prisma.holiday.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await prisma.auditLog.create({
    data: {
      actorId: a.id,
      action: "holiday.delete",
      targetType: "holiday",
      beforeJson: rows.map((r) => ({ dayKey: r.dayKey, name: r.name, officeLocationId: r.officeLocationId })),
    },
  });
  return NextResponse.json({ ok: true, deleted: rows.length });
}
