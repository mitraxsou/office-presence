import Mark from "./Mark";
import MobileBottomNav from "./MobileBottomNav";
import ViewAsBanner from "./ViewAsBanner";
import { clearSession, getSession } from "@/lib/auth";
import { displayName, greetingName } from "@/lib/display-name";
import { initials } from "@/lib/format";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

async function signOut() {
  "use server";
  await clearSession();
  redirect("/login");
}

export default async function AppShell({
  role,
  active,
  children,
}: {
  role: "user" | "admin";
  active?: string;
  children: React.ReactNode;
}) {
  const session = await getSession();
  const viewingAs = Boolean(session?.adminId && session.viewAsSessionId);
  const showAdmin = role === "admin" && !viewingAs;

  let pendingCorrections = 0;
  if (showAdmin) {
    pendingCorrections = await prisma.visitCorrectionRequest.count({ where: { status: "pending" } });
  }

  let viewAsBanner: {
    sessionId: string;
    targetName: string;
    mode: "readonly" | "full";
    expiresAt: string;
    adminName: string;
  } | null = null;

  if (viewingAs && session?.viewAsSessionId && session.adminId) {
    const row = await prisma.viewAsSession.findUnique({
      where: { id: session.viewAsSessionId },
      include: {
        admin: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
            preferredName: true,
            email: true,
            colleagueDisplayMode: true,
          },
        },
        target: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
            preferredName: true,
            email: true,
            colleagueDisplayMode: true,
          },
        },
      },
    });
    if (row && !row.endedAt && row.expiresAt.getTime() > Date.now()) {
      viewAsBanner = {
        sessionId: row.id,
        targetName: displayName(row.target),
        mode: row.mode === "full" ? "full" : "readonly",
        expiresAt: row.expiresAt.toISOString(),
        adminName: displayName(row.admin) || greetingName(row.admin),
      };
    }
  }

  const name = session?.name?.trim() || session?.email?.split("@")[0] || "You";
  const email = session?.email ?? "";
  const av = initials(session?.name, session?.email);
  const sub = showAdmin ? "Admin" : email;

  const link = (href: string, label: string, badge?: number) => (
    <a href={href} className={active === href ? "active" : undefined}>
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span className="op-badge accent" style={{ marginLeft: "auto" }}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </a>
  );

  return (
    <div className="op-shell">
      <aside className="op-rail">
        <a className="brand" href="/">
          <Mark size={22} /> Office Presence
        </a>
        {link("/month", "My month")}
        {link("/colleagues", "Colleagues")}
        {link("/settings", "Settings")}
        {showAdmin ? (
          <>
            <div className="rail-section">Admin</div>
            {link("/admin/roster", "Roster")}
            {link("/admin/corrections", "Corrections", pendingCorrections)}
            {link("/admin/users", "Users")}
            {link("/admin/offices", "Offices")}
            {link("/admin/reports", "Reports")}
            {link("/admin/settings", "Rules")}
          </>
        ) : null}
        <div className="op-rail-me">
          <div className="op-rail-me-row">
            <div className="op-avatar" aria-hidden>
              {av}
            </div>
            <div className="op-rail-me-text">
              <b title={name}>{name}</b>
              <span title={sub}>{sub}</span>
            </div>
          </div>
          <form action={signOut} className="op-rail-signout-form">
            <button className="btn btn-ghost op-rail-signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="op-main-wrap">
        {viewAsBanner ? <ViewAsBanner {...viewAsBanner} /> : null}
        <main className="op-main">{children}</main>
      </div>
      <MobileBottomNav
        showAdmin={showAdmin}
        pendingCorrections={pendingCorrections}
        name={name}
        email={email}
        avatar={av}
        signOutAction={signOut}
      />
    </div>
  );
}
