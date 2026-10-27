import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import UsersClient from "./UsersClient";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" || session.adminId) redirect("/month");

  const sp = (await searchParams) ?? {};
  const endedToast =
    sp.ended === "1"
      ? {
          you: String(sp.you ?? session.name ?? "you"),
          as: String(sp.as ?? "the user"),
          mins: Number(sp.mins ?? 1) || 1,
        }
      : null;

  const offices = await prisma.officeLocation.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell role="admin" active="/admin/users">
      <UsersClient
        offices={offices}
        adminUserId={session.id}
        endedToast={endedToast}
      />
    </AppShell>
  );
}
