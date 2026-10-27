import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "admin") redirect("/admin/roster");
  redirect("/month");
}
