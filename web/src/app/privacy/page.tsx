import Link from "next/link";
import Mark from "@/components/Mark";
import { getPolicy } from "@/lib/policy";
import { loadPrivacyNotice, parseNotice } from "@/lib/privacy-notice";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacy notice - Office Presence",
  description: "What Office Presence records, who can see it, and how long it is kept.",
};

export default async function PrivacyPage() {
  let retentionDays = 90;
  let version = "1";
  try {
    const policy = await getPolicy();
    retentionDays = policy.rawLocationRetentionDays ?? 90;
    version = policy.privacyNoticeVersion || "1";
  } catch {
    // Show the notice with defaults when policy cannot be read.
  }
  const blocks = parseNotice(await loadPrivacyNotice(retentionDays));

  return (
    <div className="op-login">
      <header className="op-login-top">
        <Link href="/login" className="op-wordmark" style={{ color: "inherit", textDecoration: "none" }}>
          <Mark size={20} /> Office Presence
        </Link>
      </header>

      <div className="op-login-center">
        <article className="op-login-card" style={{ maxWidth: 640, textAlign: "left" }}>
          {blocks.map((b, i) => {
            switch (b.kind) {
              case "h1":
                return (
                  <h1 key={i} className="op-login-title">
                    {b.text}
                  </h1>
                );
              case "h2":
                return (
                  <h2 key={i} className="op-download-h2">
                    {b.text}
                  </h2>
                );
              case "note":
                return (
                  <p key={i} className="op-badge out" style={{ display: "inline-block", marginBottom: 12 }}>
                    {b.text}
                  </p>
                );
              case "ul":
                return (
                  <ul key={i} className="op-download-steps">
                    {b.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              default:
                return (
                  <p key={i} className="op-login-lead">
                    {b.text}
                  </p>
                );
            }
          })}
          <p className="op-login-hint" style={{ textAlign: "left", marginTop: 24 }}>
            Notice version {version}.
          </p>
          <div className="op-login-alt">
            <Link href="/login" className="btn btn-ghost">
              Back to sign in
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
