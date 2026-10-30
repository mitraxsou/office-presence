import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reverseGeocode } from "@/lib/offices";
import { parseOfficeCsv, parseOfficeInput } from "@/lib/office-input";

export async function GET() {
  try { await requireAdmin(); } catch (res) { return res as Response; }
  const offices = await prisma.officeLocation.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { createdBy: { select: { email: true } } },
  });
  return NextResponse.json({ offices });
}

/** Create one office ({...}), or bulk ({ offices: [...] } or { csv: "..." }). */
export async function POST(request: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (res) { return res as Response; }
  const body = await request.json().catch(() => ({}));
  const rawList: Record<string, unknown>[] | null = Array.isArray(body.offices)
    ? body.offices
    : typeof body.csv === "string"
      ? parseOfficeCsv(body.csv)
      : null;

  if (rawList) {
    if (rawList.length === 0 || rawList.length > 200) {
      return NextResponse.json({ error: "Provide 1-200 offices" }, { status: 400 });
    }
    const parsed = rawList.map((r, i) => ({ i, v: parseOfficeInput(r) }));
    const errors = parsed.filter((p) => typeof p.v === "string").map((p) => `row ${p.i + 1}: ${p.v}`);
    if (errors.length) return NextResponse.json({ error: errors.slice(0, 10).join("; ") }, { status: 400 });
    const created = [];
    for (const p of parsed) {
      const v = p.v as Exclude<typeof p.v, string>;
      created.push(
        await prisma.officeLocation.create({
          data: {
            ...v,
            status: "active",
            createdByUserId: admin.id,
            approvedByAdminId: admin.id,
            approvedAt: new Date(),
          },
        }),
      );
    }
    await prisma.auditLog.create({
      data: { actorId: admin.id, action: "office.bulk_create", targetType: "OfficeLocation", afterJson: { count: created.length } },
    });
    return NextResponse.json({ created: created.length, offices: created });
  }

  const v = parseOfficeInput(body);
  if (typeof v === "string") return NextResponse.json({ error: v }, { status: 400 });
  const office = await prisma.officeLocation.create({
    data: {
      ...v,
      addressLabel: v.addressLabel ?? (await reverseGeocode(v.latitude, v.longitude)),
      status: "active",
      createdByUserId: admin.id,
      approvedByAdminId: admin.id,
      approvedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: { actorId: admin.id, action: "office.create", targetType: "OfficeLocation", targetId: office.id, afterJson: office },
  });
  return NextResponse.json({ office });
}

const OFFICE_STATUSES = ["active", "inactive", "pending", "rejected"] as const;
type OfficeStatusValue = (typeof OFFICE_STATUSES)[number];

function isOfficeStatus(value: string): value is OfficeStatusValue {
  return (OFFICE_STATUSES as readonly string[]).includes(value);
}

/** Status change only: do not re-check radius or coordinates, and do not rewrite them. */
function isStatusOnly(body: Record<string, unknown>) {
  if (body.status == null) return false;
  return Object.keys(body).every((key) => key === "id" || key === "status" || body[key] == null);
}

function statusAction(before: OfficeStatusValue, next: OfficeStatusValue) {
  if (next === "inactive" && before !== "inactive") return "office.deactivate";
  if (next === "active" && before !== "active") return "office.activate";
  return "office.update";
}

export async function PATCH(request: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (res) { return res as Response; }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const before = await prisma.officeLocation.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.deletedAt) {
    return NextResponse.json({ error: "This office was deleted" }, { status: 400 });
  }
  const status = body.status != null ? String(body.status) : before.status;
  if (!isOfficeStatus(status)) {
    return NextResponse.json({ error: "status invalid" }, { status: 400 });
  }

  if (isStatusOnly(body)) {
    const office = await prisma.officeLocation.update({
      where: { id },
      data: {
        status,
        ...(status === "active" && before.status !== "active"
          ? { approvedByAdminId: admin.id, approvedAt: new Date() }
          : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: statusAction(before.status, status),
        targetType: "OfficeLocation",
        targetId: id,
        beforeJson: before,
        afterJson: office,
      },
    });
    return NextResponse.json({ office });
  }

  const merged = parseOfficeInput({ ...before, ...body });
  if (typeof merged === "string") return NextResponse.json({ error: merged }, { status: 400 });
  const moved = merged.latitude !== before.latitude || merged.longitude !== before.longitude;
  const office = await prisma.officeLocation.update({
    where: { id },
    data: {
      ...merged,
      addressLabel:
        body.addressLabel != null
          ? merged.addressLabel
          : moved
            ? await reverseGeocode(merged.latitude, merged.longitude)
            : before.addressLabel,
      status,
      ...(status === "active" && before.status !== "active"
        ? { approvedByAdminId: admin.id, approvedAt: new Date() }
        : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: statusAction(before.status, status),
      targetType: "OfficeLocation",
      targetId: id,
      beforeJson: before,
      afterJson: office,
    },
  });
  return NextResponse.json({ office });
}

/**
 * Remove the office from the admin list. Sets deletedAt and status inactive.
 * The row stays so past visits, events, and home-office links remain valid.
 */
export async function DELETE(request: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (res) { return res as Response; }
  const body = await request.json().catch(() => ({}));
  const sp = new URL(request.url).searchParams;
  const id = String(body.id ?? sp.get("id") ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const before = await prisma.officeLocation.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.deletedAt) {
    return NextResponse.json({ office: before });
  }
  const office = await prisma.officeLocation.update({
    where: { id },
    data: { status: "inactive", deletedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "office.delete",
      targetType: "OfficeLocation",
      targetId: id,
      beforeJson: before,
      afterJson: office,
    },
  });
  return NextResponse.json({ office });
}
