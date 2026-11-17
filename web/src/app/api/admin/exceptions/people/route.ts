import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireExceptionGranter } from "@/lib/actor";
import { displayName } from "@/lib/display-name";

/** Person search for the grant drawer: name, email and home office only. */
export async function GET(request: Request) {
  const actor = await requireExceptionGranter(request);
  if (actor instanceof Response) return actor;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const rows = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      isTestAccount: false,
      isDummy: false,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { preferredName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      email: true,
      colleagueDisplayMode: true,
      homeOffice: { select: { id: true, name: true, pointsPerVisitDay: true } },
    },
  });
  return NextResponse.json({
    people: rows.map((u) => ({
      id: u.id,
      name: displayName(u),
      email: u.email,
      homeOffice: u.homeOffice
        ? { id: u.homeOffice.id, name: u.homeOffice.name, pointsPerVisitDay: u.homeOffice.pointsPerVisitDay }
        : null,
    })),
  });
}
