# Create GitHub Release with pilot APK

Requires GitHub CLI (`gh`) signed in with `repo` scope.

```powershell
# From repo root, after assembleRelease
$apk = "android/app/build/outputs/apk/release/app-release.apk"
$notes = "docs/release-notes-v2.0.1-pilot.md"

gh release create "v2.0.1-pilot" $apk `
  --repo "mitraxsou/office-presence" `
  --title "Office Presence 2.0.1 (pilot)" `
  --notes-file $notes `
  --latest=false
```

Release URL example: https://github.com/mitraxsou/office-presence/releases/tag/v2.0.1-pilot

Asset URL (for `NEXT_PUBLIC_ANDROID_APK_URL`):

```
https://github.com/mitraxsou/office-presence/releases/download/v2.0.1-pilot/app-release.apk
```

Do not commit the APK into the git tree. Do not force-push.
