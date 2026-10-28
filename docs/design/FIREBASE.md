# Firebase (FCM + Analytics + Crashlytics + App Distribution)

Spark / free. Used for remote force-logout, work-hours presence wake, client analytics, crash reporting, and pilot APK distribution. API and Postgres stay on Vercel + Neon.

## Pilot APK channels (keep all three)

| Channel | Who it is for | How |
|---|---|---|
| Firebase App Distribution (Console or CLI) | Invited testers via App Tester | Upload APK to project `office-presence-f8100`, group `pilot` (see App Distribution below). Scaffolding stays in repo: `firebase.json`, `.firebaserc`, `scripts/distribute-android.ps1`, `npm run distribute:android`. |
| GitHub Release | Anyone with repo/release access; also the source URL for the public page | Tag e.g. `v2.0.1-pilot`, attach `app-release.apk`, short install notes. Do not commit the APK into the tree. |
| Public `/download` page | Anyone who can open the pilot web app | `https://office-presence-psi.vercel.app/download`. Button uses `NEXT_PUBLIC_ANDROID_APK_URL` (set on Vercel to the GitHub Release asset browser URL, then redeploy). Login footer links here. |

Uninstall a debug-signed build before installing a release APK if the signing key differs.

### Vercel env for `/download`

Production variable (set for pilot):

```
NEXT_PUBLIC_ANDROID_APK_URL=https://github.com/mitraxsou/office-presence/releases/download/v2.0.1-pilot/app-release.apk
```

After changing it, redeploy Production so the Next.js build inlines the public URL. The `/download` route ships with the web app; commit and push the page, then redeploy (or `vercel --prod` from `web/`) before it appears live.

**Private repo note:** `mitraxsou/office-presence` is private. Unauthenticated browsers get 404 on the GitHub asset URL. Collaborators signed into GitHub can download from the Release page. For a true public `/download` button (no GitHub login), point `NEXT_PUBLIC_ANDROID_APK_URL` at a publicly reachable APK host, or use Firebase App Tester for invited pilots.

## Files (never commit)

| File | Where |
|---|---|
| `google-services.json` | `android/app/google-services.json` (gitignored) |
| Admin SDK JSON | `FIREBASE_SERVICE_ACCOUNT_JSON` in `web/.env.local` and Vercel |
| Cron auth | `CRON_SECRET` in `web/.env.local` and Vercel |
| Release keystore | `android/office-presence-pilot.jks` (gitignored) |
| Keystore passwords | `android/keystore.properties` (gitignored; see `keystore.properties.example`) |

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

Optional overrides: `FIREBASE_ANDROID_APP_ID`, `FIREBASE_DISTRIBUTE_GROUP` (default `pilot`), `FIREBASE_RELEASE_NOTES`.

The script uploads `android/app/build/outputs/apk/release/app-release.apk`. Rebuild with Crashlytics included first if the APK is older than the Crashlytics Gradle change.

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
