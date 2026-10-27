import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { adminRoster } from "@/lib/roster";
import Nav from "@/components/Nav";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/me");
  const roster = await adminRoster();
  return (
    <main>
      <Nav role="admin" active="/admin" />
      <div className="card card-brand">
        <span className="card-title">Admin</span>
        <h1>Roster</h1>
        <p className="lead" style={{ marginBottom: 0 }}>
          One row per person, merged across their phones. Refreshes every 30 seconds while this tab is visible. Target{" "}
          {roster.pointsTarget} points per month; hours are FYI (advised {roster.dayHoursAdvisory}h).
        </p>
      </div>
      <AdminClient initial={roster} />
    </main>
  );
}
