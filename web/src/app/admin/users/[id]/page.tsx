import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import UserVisitsClient from "./UserVisitsClient";
import Nav from "@/components/Nav";

export default async function UserVisitsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/me");
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const visits = await prisma.visit.findMany({
    where: { userId: id },
    orderBy: { startAt: "desc" },
    take: 100,
  });
  return (
    <main>
      <Nav role="admin" active="/admin" />
      <div className="card card-brand">
        <span className="card-title">User visits</span>
        <h1>{user.name ?? user.email}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {user.email}
        </p>
      </div>
      <UserVisitsClient
        userId={user.id}
        visits={visits.map((v) => ({
          id: v.id,
          startAt: v.startAt.toISOString(),
          endAt: v.endAt?.toISOString() ?? "",
          source: v.source,
          reason: v.reason,
        }))}
      />
    </main>
  );
}
