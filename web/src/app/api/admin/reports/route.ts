import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { adminRoster } from "@/lib/roster";

export async function GET(request: Request) {
  try { await requireAdmin(); } catch (res) { return res as Response; }
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(sp.get("pageSize") ?? 25)));
  const roster = await adminRoster();
  const [pendingCorrections, pendingOffices] = await Promise.all([
    prisma.visitCorrectionRequest.count({ where: { status: "pending" } }),
    prisma.officeLocation.count({ where: { status: "pending" } }),
  ]);
  const rows = roster.users
    .map((u) => ({ ...u, met: u.monthPoints >= roster.pointsTarget }))
    .sort((a, b) => b.monthPoints - a.monthPoints || a.email.localeCompare(b.email));
  return NextResponse.json({
    pointsTarget: roster.pointsTarget,
    metCount: rows.filter((r) => r.met).length,
    totalUsers: rows.length,
    pendingCorrections,
    pendingOffices,
    users: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: rows.length },
  });
}
