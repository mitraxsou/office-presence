# Firebase (FCM + Analytics + Crashlytics + App Distribution)

Spark / free. Used for remote force-logout, work-hours presence wake, client analytics, crash reporting, and pilot APK distribution. API and Postgres stay on Vercel + Neon.

## Pilot APK channels (keep all three)

| Channel | Who it is for | How |
|---|---|---|
| Firebase App Distribution (Console or CLI) | Invited testers via App Tester | Upload APK to project `office-presence-f8100`, group `pilot` (see App Distribution below). Scaffolding stays in repo: `firebase.json`, `.firebaserc`, `scripts/distribute-android.ps1`, `npm run distribute:android`. |
| GitHub Release | Anyone with repo/release access | Tag e.g. `v2.0.7-pilot`, attach `app-release.apk`, notes from `docs/releases/<versionName>.md`. Do not commit the APK into the tree. |
| Public `/download` page | Anyone who can open the pilot web app | `https://office-presence-psi.vercel.app/download`. The button downloads `/downloads/office-presence.apk` hosted with the site, unless policy `appApkUrl` is set. Login footer links here. |

## Release notes (required for every new version)

Before bumping `versionCode` / `versionName` in `android/app/build.gradle.kts` and shipping:

1. Add `docs/releases/<versionName>.md` (example: `docs/releases/2.0.6.md`). Short user-facing bullets plus an install note if the signing key differs from debug.
2. `npm run distribute:android` and the distribute scripts read that file (parsed from `versionName`) and pass it as Firebase release notes. They **fail** if the file is missing.
3. GitHub releases use the same file via `--notes-file` (see `docs/create-github-release-apk.md`).
4. `assembleRelease` only **prints** the notes path; a missing file does not fail compile (so debug builds stay easy).

Do not use em dash or en dash in notes. Keep older files under `docs/releases/` (history stays). The old path `docs/release-notes-v2.0.1-pilot.md` points at `docs/releases/2.0.1.md`.

Uninstall a debug-signed build before installing a release APK if the signing key differs.

### Vercel env for `/download`

The button defaults to `/downloads/office-presence.apk` on the same host. Policy `appApkUrl` replaces that path when an admin sets it. Redeploy Production from `web/` with `vercel --prod` after replacing the APK file.

Copy the signed APK to `web/public/downloads/office-presence.apk` before that deploy. The file is listed in `.gitignore`, so it is not committed.

**Private repo note:** `mitraxsou/office-presence` is private. A GitHub Release asset URL returns 404 unless the person is signed in to GitHub. The copy under `/downloads/` is the public file.

## App update push (download page)

Saving a higher Android version code sends an `app_update` data message (`notifyOutdatedDevices` for every older phone, and `maybeNotifyDeviceUpdate` when one phone checks in). The message `url` is always the public `/download` page (`downloadPageUrl`). `policy.appApkUrl` does not change this push. Phones use that APK URL only on sync, and only when it is a direct `https` link whose path ends in `.apk`.

The notification opens the download page. Tapping it does not start an APK download inside the app. Phones still on an older version are reminded once each weekday by the presence-ping cron (first call inside 09:00 to 19:00). `/api/cron/app-update` sends the same reminder on days that cron does not run. Each phone is marked with `updateRemindedOn` so a later call the same day does not send again. Opening the app on a build that includes this check asks to open the download page. Do not paste the private GitHub Release asset into `appApkUrl`. `mitraxsou/office-presence` returns 404 unless the person is signed in to GitHub.

The APK must use the same keystore as the installed pilot build (`android/office-presence-pilot.jks`). A different signing key cannot replace the app that is already installed.

## Files (never commit)

| File | Where |
|---|---|
| `google-services.json` | `android/app/google-services.json` (gitignored) |
| Admin SDK JSON | `FIREBASE_SERVICE_ACCOUNT_JSON` in `web/.env.local` and Vercel |
| Cron auth | `CRON_SECRET` in `web/.env.local` and Vercel |
| Release keystore | `android/office-presence-pilot.jks` (gitignored) |
| Keystore passwords | `android/keystore.properties` (gitignored; see `keystore.properties.example`) |

## Staging debug app (`com.pwc.officepresence.staging`)

Debug builds use `applicationIdSuffix ".staging"`, so the package is `com.pwc.officepresence.staging`. The Google Services Gradle plugin fails the build when `android/app/google-services.json` has no client for that package. `FirebaseGate.kt` no-ops at runtime when `google_app_id` is missing, but the Gradle plugin does not.

Before the first debug build on a machine:

1. Firebase console, project settings, Add app, Android, package `com.pwc.officepresence.staging`. Add the debug SHA-1 if Crashlytics or App Check need it.
2. Download the new `google-services.json`. It contains both clients (production and `.staging`). Replace the local `android/app/google-services.json` with it. Keep it gitignored.
3. Set `STAGING_API_BASE_URL` in `android/local.properties` to the staging web URL. The debug build fails without it, so it never talks to production.
4. The staging web app needs its own `FIREBASE_SERVICE_ACCOUNT_JSON` (same project is fine) so pushes reach the staging app.

## Pilot release signing

1. Copy `android/keystore.properties.example` to `android/keystore.properties`.
2. Point `storeFile` at your JKS (or generate one with `keytool`) and set passwords.
3. **Reuse the same keystore** for every pilot upload. A new key forces testers to uninstall first.
4. Build: from `android/`, run `gradlew.bat assembleRelease`. APK: `android/app/build/outputs/apk/release/app-release.apk`.

## App Distribution (no browser on the build machine)

Firebase project: `office-presence-f8100`  
Android app id: `1:444745156088:android:0a8e8296ed2794f356420d`

Local scaffolding (already in repo): `firebase.json`, `.firebaserc`, `scripts/distribute-android.ps1`, and `npm run distribute:android`.

This build PC cannot open Firebase Console or run `firebase login` in a browser. Use one of the paths below from a machine that can.

### A) CI token on this PC (CLI upload)

On another machine that can open a browser:

1. Install Firebase CLI: `npm i -g firebase-tools`
2. Run `firebase login:ci` and complete the browser login.
3. Copy the printed refresh token. Do not commit it or paste it into chat logs.

On this build PC (PowerShell session only; do not write the token into the repo):

```powershell
$env:FIREBASE_TOKEN = "<paste token from login:ci>"
npm run distribute:android
```

Optional overrides: `FIREBASE_ANDROID_APP_ID`, `FIREBASE_DISTRIBUTE_GROUP` (default `pilot`). `FIREBASE_RELEASE_NOTES` can override the notes **text** after `docs/releases/<versionName>.md` exists; the file is still required.

The script uploads `android/app/build/outputs/apk/release/app-release.apk` and loads notes from `docs/releases/<versionName>.md`. Rebuild with Crashlytics included first if the APK is older than the Crashlytics Gradle change.

### B) Manual upload from another device

1. Copy `android/app/build/outputs/apk/release/app-release.apk` to a machine with Console access (USB, network share, or secure transfer).
2. Open Firebase Console > App Distribution for project `office-presence-f8100`.
3. Select the Android app, upload the APK, choose release notes, and distribute to group `pilot`.

### C) Create group `pilot` and invite testers (Console, once)

On a machine with Console access:

1. Firebase Console > App Distribution > Testers and groups.
2. Create group `pilot` if it does not exist.
3. Add known tester emails to `pilot`.
4. Testers get an invite email, open Firebase App Tester, and install the APK. Uninstall any debug-signed build first (signature mismatch).

### D) Service account (usually not enough by itself)

`FIREBASE_SERVICE_ACCOUNT_JSON` in `web/.env.local` is for the Admin SDK (FCM). It does **not** grant App Distribution upload unless you also give that service account **Firebase App Distribution Admin** in Cloud IAM for `office-presence-f8100`.

Even then, prefer path A (`FIREBASE_TOKEN` from `firebase login:ci`). The Firebase CLI on this PC ignores interactive login and treats missing `FIREBASE_TOKEN` as unauthenticated. Do not commit service-account JSON or tokens.

## Crashlytics

Gradle: `com.google.firebase.crashlytics` plugin (root + app) and `firebase-crashlytics` via BOM `33.7.0`. Auto-collection is on. Custom keys are build metadata only (`version_name`, `version_code`, `build_type`); never email, name, or GPS.

1. Firebase Console > Crashlytics > enable for the Android app if prompted (one-time).
2. Ship a build that includes the SDK, open the app once, then either wait for a real crash or use a temporary test crash in a debug build.
3. Reports appear under Crashlytics (often within a few minutes after the process restarts and uploads).

Never commit `google-services.json`, keystores, or service-account JSON.

## What tracks what

- **Firebase Analytics:** app screens, sign-in, sync, force_sign_out, presence_check. No email, name, or GPS in event params.
- **Firebase Crashlytics:** fatal and non-fatal crashes; build keys only, no PII.
- **DeviceApiActivity (Neon):** per-device HTTP route hits in Admin Users.
- **Vercel dashboard:** serverless invocation volume / Hobby limits.

## Force logout

1. Phone registers FCM token via `PATCH /api/me/devices` `{ fcmToken }`.
2. Admin delete/deactivate calls `sendForceSignOutToUser` then revokes tokens.
3. Phone receives `type=force_sign_out` and runs `forceSignOut`.

## Presence wake (OEM kill safety net)

Geofence + foreground service remain primary. When OEMs kill the process mid-day, a high-priority FCM `presence_check` wakes the phone for one fused location + `forceDetect` upload.

- **API:** `GET|POST /api/cron/presence-ping` with `Authorization: Bearer CRON_SECRET` (or `?secret=`).
- **Window:** Mon-Fri 09:00-19:00 in policy timezone (default Asia/Kolkata). Pass `?force=1` to bypass the window for tests.
- **Hobby note:** Vercel Hobby native cron is effectively daily. Use an external free scheduler (cron-job.org, GitHub Actions) every **60 minutes** in that window (~8-10 invokes/day).
- **Skip:** devices with `lastSeenAt` within the last 20 minutes.
- **Limit:** **Force stop** (Settings > Force stop, or some OEM swipe=kill) blocks FCM until the user opens the app once.

Example external cron URL:

`https://office-presence-psi.vercel.app/api/cron/presence-ping`  
Header: `Authorization: Bearer <CRON_SECRET>`

## Office Tracker daily sync

People without an active phone get missing visit days from Office Tracker. People whose phone app has checked in are left alone. This is a separate URL. Do not call it from presence-ping or correction-digest.

- **API:** `GET|POST /api/cron/office-tracker-sync` with `Authorization: Bearer CRON_SECRET` (or `?secret=`).
- **Tracker:** fetches `OFFICE_TRACKER_SYNC_URL` (default `https://office-tracker-theta.vercel.app/api/cron/presence-backfill`) with `Authorization: Bearer OFFICE_TRACKER_SYNC_SECRET`. That secret must match the tracker `PRESENCE_SYNC_SECRET`. If it is missing, the sync writes nothing.
- **Once a day:** at most one successful sync per Asia/Kolkata calendar day. A later call the same day returns the previous result and does not fetch again. Pass `?force=1` to run again.
- **Schedule:** its own daily URL. Vercel Hobby cron is daily-only, so use an external scheduler once each morning.

Example:

`https://office-presence-psi.vercel.app/api/cron/office-tracker-sync`  
Header: `Authorization: Bearer <CRON_SECRET>`
