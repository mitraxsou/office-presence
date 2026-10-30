import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { sendTeamsNotification } from "@/lib/notifications";
import { dayKeyInTz } from "@/lib/visit-calculator";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

function kolkataHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

/** Once a day at 9:00 Asia/Kolkata. Call from the same cron host as presence-ping. */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const policy = await getPolicy();
  if (policy.correctionDailyDigest === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "digest_off" });
  }
  const now = new Date();
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && kolkataHour(now) !== 9) {
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_hour" });
  }
  const day = dayKeyInTz(now, "Asia/Kolkata");
  const row = await prisma.policy.findUnique({ where: { id: 1 } });
  if (!force && row?.correctionDigestDay === day) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_sent" });
  }
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await prisma.visitCorrectionRequest.findMany({
    where: { status: "auto_approved", createdAt: { gte: since } },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  await prisma.policy.update({ where: { id: 1 }, data: { correctionDigestDay: day } });
  if (!rows.length) return NextResponse.json({ ok: true, sent: 0 });
  const lines = rows.map((r) => {
    const who = r.user.name || r.user.email;
    return `${who} ${r.dayKey}: ${r.reason}`;
  });
  const message = `Auto approved corrections since yesterday:\n${lines.join("\n")}`;
  const admins = await prisma.user.findMany({
    where: { role: "admin", deactivatedAt: null },
    select: { email: true, name: true },
  });
  let sent = 0;
  for (const admin of admins) {
    const ok = await sendTeamsNotification({
      type: "custom",
      email: admin.email,
      name: admin.name ?? admin.email,
      message,
    });
    if (ok) sent += 1;
  }
  return NextResponse.json({ ok: true, sent, count: rows.length });
}

export async function GET(request: Request) {
  return POST(request);
}
