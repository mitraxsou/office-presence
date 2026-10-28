import { NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/actor";
import { prisma } from "@/lib/db";

/** Recent significant API activity for a user (optionally filtered by device). No coordinates. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const actor = await requireAdminActor(request);
  if (actor instanceof Response) return actor;

  const { id: userId } = await ctx.params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deviceId = new URL(request.url).searchParams.get("deviceId")?.trim() || null;
  if (deviceId) {
    const device = await prisma.deviceToken.findFirst({
      where: { id: deviceId, userId },
      select: { id: true },
    });
    if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const rows = await prisma.deviceApiActivity.findMany({
    where: {
      userId,
      ...(deviceId ? { deviceTokenId: deviceId } : {}),
    },
    orderBy: { at: "desc" },
    take: 20,
    select: {
      id: true,
      deviceTokenId: true,
      method: true,
      path: true,
      statusCode: true,
      durationMs: true,
      note: true,
      at: true,
    },
  });

  return NextResponse.json({
    activity: rows.map((r) => ({
      id: r.id,
      deviceId: r.deviceTokenId,
      method: r.method,
      path: r.path,
      statusCode: r.statusCode,
      durationMs: r.durationMs,
      note: r.note,
      at: r.at.toISOString(),
    })),
  });
}
