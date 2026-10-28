"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Props = {
  showAdmin: boolean;
  pendingCorrections: number;
  name: string;
  email: string;
  avatar: string;
  signOutAction: () => Promise<void>;
};

function Icon({ name }: { name: "month" | "year" | "roster" | "corrections" | "more" | "colleagues" | "settings" }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  switch (name) {
    case "month":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "year":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4M8 14h3M13 14h3M8 18h3M13 18h3" />
        </svg>
      );
    case "roster":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
          <path d="M16 11h5M18.5 8.5v5" />
        </svg>
      );
    case "corrections":
      return (
        <svg {...common}>
          <path d="M9 5h11v14H9z" />
          <path d="M9 9h7M9 13h5M5 5v14" />
        </svg>
      );
    case "colleagues":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M2 20c0-3.2 2.7-5.5 7-5.5 1.4 0 2.6.3 3.6.8" />
          <path d="M14 20c0-2.2 1.8-4 4.5-4S23 17.8 23 20" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

function TabLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: "month" | "year" | "roster" | "corrections" | "more" | "colleagues" | "settings";
  active: boolean;
  badge?: number;
}) {
  return (
    <a href={href} className={`op-mnav-item${active ? " active" : ""}`}>
      <span className="op-mnav-icon">
        <Icon name={icon} />
        {badge && badge > 0 ? <span className="op-mnav-badge">{badge > 99 ? "99+" : badge}</span> : null}
      </span>
      <span className="op-mnav-label">{label}</span>
    </a>
  );
}

export default function MobileBottomNav({
  showAdmin,
  pendingCorrections,
  name,
  email,
  avatar,
  signOutAction,
}: Props) {
  const pathname = usePathname() || "/";
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [moreOpen]);

  const isMonth = pathname === "/" || pathname.startsWith("/month");
  const isYear = pathname.startsWith("/year");
  const isColleagues = pathname.startsWith("/colleagues");
  const isSettings = pathname.startsWith("/settings");
  const isRoster = pathname.startsWith("/admin/roster");
  const isCorrections = pathname.startsWith("/admin/corrections");
  const moreActive =
    showAdmin &&
    (pathname.startsWith("/admin/users") ||
      pathname.startsWith("/admin/offices") ||
      pathname.startsWith("/admin/reports") ||
      pathname.startsWith("/admin/settings") ||
      isYear ||
      isColleagues ||
      isSettings);

  return (
    <>
      <nav className="op-mnav" aria-label="Primary">
        {showAdmin ? (
          <>
            <TabLink href="/month" label="My month" icon="month" active={isMonth} />
            <TabLink href="/admin/roster" label="Roster" icon="roster" active={isRoster} />
            <TabLink
              href="/admin/corrections"
              label="Corrections"
              icon="corrections"
              active={isCorrections}
              badge={pendingCorrections}
            />
            <button
              type="button"
              className={`op-mnav-item${moreActive || moreOpen ? " active" : ""}`}
              onClick={() => setMoreOpen(true)}
            >
              <span className="op-mnav-icon">
                <Icon name="more" />
              </span>
              <span className="op-mnav-label">More</span>
            </button>
          </>
        ) : (
          <>
            <TabLink href="/month" label="My month" icon="month" active={isMonth} />
            <TabLink href="/year" label="My year" icon="year" active={isYear} />
            <TabLink href="/settings" label="Settings" icon="settings" active={isSettings} />
          </>
        )}
      </nav>

      {moreOpen ? (
        <div className="op-msheet" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" className="op-msheet-scrim" aria-label="Close" onClick={() => setMoreOpen(false)} />
          <div className="op-msheet-panel">
            <div className="op-msheet-grab" aria-hidden />
            <div className="op-msheet-me">
              <div className="op-avatar" aria-hidden>
                {avatar}
              </div>
              <div>
                <b>{name}</b>
                <div className="help">
                  {email}
                  {showAdmin ? ", Admin" : ""}
                </div>
              </div>
            </div>

            <div className="op-msheet-section">Admin</div>
            <div className="op-msheet-card">
              <a href="/admin/users" onClick={() => setMoreOpen(false)}>
                Users <span aria-hidden>&gt;</span>
              </a>
              <a href="/admin/offices" onClick={() => setMoreOpen(false)}>
                Offices <span aria-hidden>&gt;</span>
              </a>
              <a href="/admin/reports" onClick={() => setMoreOpen(false)}>
                Reports <span aria-hidden>&gt;</span>
              </a>
              <a href="/admin/settings" onClick={() => setMoreOpen(false)}>
                Rules <span aria-hidden>&gt;</span>
              </a>
            </div>

            <div className="op-msheet-section">You</div>
            <div className="op-msheet-card">
              <a href="/year" onClick={() => setMoreOpen(false)}>
                My year <span aria-hidden>&gt;</span>
              </a>
              <a href="/colleagues" onClick={() => setMoreOpen(false)}>
                Colleagues <span aria-hidden>&gt;</span>
              </a>
              <a href="/settings" onClick={() => setMoreOpen(false)}>
                Settings <span aria-hidden>&gt;</span>
              </a>
            </div>

            <form action={signOutAction} className="op-msheet-signout">
              <button type="submit" className="btn btn-secondary" style={{ width: "100%" }}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
