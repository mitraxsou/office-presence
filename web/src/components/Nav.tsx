import Mark from "./Mark";
import { clearSession } from "@/lib/auth";
import { redirect } from "next/navigation";

async function signOut() {
  "use server";
  await clearSession();
  redirect("/login");
}

export default function Nav({ role, active }: { role: "user" | "admin"; active?: string }) {
  const link = (href: string, label: string) => (
    <a href={href} className={active === href ? "active" : undefined}>
      {label}
    </a>
  );
  return (
    <nav className="nav">
      <a className="brand" href="/">
        <Mark size={26} />
        <span>Office Presence</span>
      </a>
      <div className="nav-actions">
        {link("/me", "My month")}
        {link("/peers", "Peers")}
        {link("/settings", "Settings")}
        {role === "admin" ? (
          <>
            {link("/admin", "Roster")}
            {link("/admin/offices", "Offices")}
            {link("/admin/reports", "Reports")}
            {link("/admin/settings", "Rules")}
          </>
        ) : null}
        <form action={signOut}>
          <button className="btn btn-secondary btn-sm" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
