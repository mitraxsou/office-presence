import Link from "next/link";
import Mark from "@/components/Mark";
import { getPolicy } from "@/lib/policy";

const VERSION = "2.0.2";
const DEFAULT_APK_URL =
  "https://github.com/mitraxsou/office-presence/releases/download/v2.0.2-pilot/app-release.apk";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Download Android app - Office Presence",
  description: "Download the Office Presence Android APK for the PwC pilot.",
};

export default async function DownloadPage() {
  let version = VERSION;
  let apkUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim() || DEFAULT_APK_URL;
  try {
    const policy = await getPolicy();
    if (policy.appVersionName?.trim()) version = policy.appVersionName.trim();
    if (policy.appApkUrl?.trim()) apkUrl = policy.appApkUrl.trim();
  } catch {
    // Keep the env fallback when policy cannot be read.
  }
  const published = Boolean(apkUrl);

  return (
    <div className="op-login">
      <header className="op-login-top">
        <Link href="/login" className="op-wordmark" style={{ color: "inherit", textDecoration: "none" }}>
          <Mark size={20} /> Office Presence
        </Link>
      </header>

      <div className="op-login-center">
        <div className="op-login-card" style={{ maxWidth: 480 }}>
          <h1 className="op-login-title">Download the Android app</h1>
          <p className="op-login-lead">
            Pilot build for phones. Version {version} (signed release).
          </p>

          {published ? (
            <a
              className="btn btn-primary btn-block"
              href={apkUrl}
              download
              rel="noopener noreferrer"
            >
              Download Android APK
            </a>
          ) : (
            <div className="op-msg-err" role="status">
              <span className="op-msg-err-icon" aria-hidden>
                !
              </span>
              <div>
                <b>APK not published yet</b>
                Set NEXT_PUBLIC_ANDROID_APK_URL on the host (point it at the GitHub
                Release asset URL), then redeploy. Until then this page cannot start
                a download.
              </div>
            </div>
          )}

          <h2 className="op-download-h2">Install steps</h2>
          <ol className="op-download-steps">
            <li>
              On Android, allow installs from this browser (Settings, then Install
              unknown apps, then allow Chrome or your browser).
            </li>
            <li>
              If you already have a debug build, uninstall it first. A different
              signing key blocks the update.
            </li>
            <li>Open the downloaded APK and install Office Presence.</li>
            <li>
              Sign in with your PwC email (Teams code or password), then allow
              location so the app can detect office presence.
            </li>
          </ol>

          <p className="op-login-hint" style={{ textAlign: "left", marginTop: 24 }}>
            Prefer Firebase App Tester? Ask a pilot admin for an invite. Same APK,
            different install path.
          </p>

          <div className="op-login-alt">
            <Link href="/login" className="btn btn-ghost">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>

      <footer className="op-login-foot">
        PwC internal pilot. Direct APK download for phones that cannot use Play Store.
      </footer>
    </div>
  );
}
