import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { countsAs } from "@/lib/days-format";
import OfficeDetailMap from "./OfficeDetailMap";

export default async function OfficeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/month");
  const { id } = await params;
  const office = await prisma.officeLocation.findUnique({ where: { id }, include: { createdBy: { select: { email: true } } } });
  if (!office) notFound();
  const [inNow, events30d] = await Promise.all([
    prisma.currentStatus.count({ where: { officeLocationId: id, inOffice: true } }),
    prisma.presenceEvent.count({
      where: { officeLocationId: id, simulated: false, recordedAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } },
    }),
  ]);
  return (
    <AppShell role="admin" active="/admin/offices">
      <div className="card card-brand">
        <span className="card-title">Office</span>
        <h1>{office.name}</h1>
        <p className="lead" style={{ marginBottom: 0 }}>{office.addressLabel ?? `${office.latitude}, ${office.longitude}`}</p>
      </div>
      <div className="card">
        <OfficeDetailMap lat={office.latitude} lng={office.longitude} radiusMeters={office.radiusMeters} label={office.name} />
        <div className="stat-grid">
          <div className="stat"><span className="stat-label">Counts as</span><span className="stat-value">{countsAs(office.pointsPerVisitDay)}</span></div>
          <div className="stat"><span className="stat-label">Radius</span><span className="stat-value">{office.radiusMeters} m</span></div>
          <div className="stat"><span className="stat-label">In now</span><span className="stat-value">{inNow}</span></div>
          <div className="stat"><span className="stat-label">Events (30 days)</span><span className="stat-value">{events30d}</span></div>
        </div>
        <p className="help" style={{ marginTop: "1rem" }}>
          Status {office.status}. {office.createdBy ? `Created by ${office.createdBy.email}.` : ""}{" "}
          <a href="/admin/offices">Back to offices</a>
        </p>
      </div>
    </AppShell>
  );
}
