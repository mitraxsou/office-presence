# Create GitHub Release with pilot APK

Requires GitHub CLI (`gh`) signed in with `repo` scope.

## Before every new version

1. Bump `versionCode` and `versionName` in `android/app/build.gradle.kts`.
2. Add `docs/releases/<versionName>.md` with short user-facing notes (and an install note if the signing key differs from debug). Distribute and this GitHub flow **require** that file.
3. Build: `npm run android:release` (prints the notes path; missing notes do not fail the compile).

Historical notes stay under `docs/releases/` (for example `2.0.1.md`). The old file `docs/release-notes-v2.0.1-pilot.md` redirects there.

## Create the release

```powershell
# From repo root, after assembleRelease
$apk = "android/app/build/outputs/apk/release/app-release.apk"
$versionName = (node scripts/android-release-notes.mjs --version).Trim()
$notes = "docs/releases/$versionName.md"
$tag = "v$versionName-pilot"

if (-not (Test-Path $notes)) {
  throw "Missing $notes. Add release notes before creating the GitHub release."
}

gh release create $tag $apk `
  --repo "mitraxsou/office-presence" `
  --title "Office Presence $versionName (pilot)" `
  --notes-file $notes `
  --latest=$false
```

Release URL example: https://github.com/mitraxsou/office-presence/releases/tag/v2.0.2-pilot

Asset URL (for `NEXT_PUBLIC_ANDROID_APK_URL`):

```
https://github.com/mitraxsou/office-presence/releases/download/v2.0.2-pilot/app-release.apk
```

Also update `web/src/app/download/page.tsx` `VERSION` when that page hardcodes the pilot version label, then set the Vercel env and redeploy.

Do not commit the APK into the git tree. Do not force-push. No em dash or en dash in notes.
