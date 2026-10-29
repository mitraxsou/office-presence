# Upload the release APK to Firebase App Distribution (group: pilot).
# Auth: set FIREBASE_TOKEN from `firebase login:ci` on a machine with a browser,
# or use an existing firebase login / service-account ADC. Do not commit tokens.
# Also requires: assembleRelease already built, pilot group exists in Console.
# Release notes: docs/releases/<versionName>.md (required). Optional FIREBASE_RELEASE_NOTES overrides text.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
$appId = if ($env:FIREBASE_ANDROID_APP_ID) { $env:FIREBASE_ANDROID_APP_ID } else { "1:444745156088:android:0a8e8296ed2794f356420d" }
$group = if ($env:FIREBASE_DISTRIBUTE_GROUP) { $env:FIREBASE_DISTRIBUTE_GROUP } else { "pilot" }

$helper = Join-Path $root "scripts\android-release-notes.mjs"
$versionName = (& node $helper --version).Trim()
if ($LASTEXITCODE -ne 0 -or -not $versionName) {
  Write-Error "Could not read versionName. Fix android/app/build.gradle.kts."
}
$notesPath = Join-Path $root "docs\releases\$versionName.md"
if (-not (Test-Path $notesPath)) {
  Write-Error "Missing release notes for versionName $versionName. Create $notesPath before distribute or GitHub release. See docs/create-github-release-apk.md and docs/design/FIREBASE.md."
}
$useNotesFile = -not $env:FIREBASE_RELEASE_NOTES
Write-Host "versionName $versionName; release notes: $notesPath"

if (-not (Test-Path $apk)) {
  Write-Error "Missing APK at $apk. Run: cd android; .\gradlew.bat assembleRelease"
}

if (-not $env:FIREBASE_TOKEN -and -not $env:GOOGLE_APPLICATION_CREDENTIALS) {
  Write-Host "Note: FIREBASE_TOKEN and GOOGLE_APPLICATION_CREDENTIALS are unset."
  Write-Host "If firebase CLI has no cached login, this upload will fail."
  Write-Host "See docs/design/FIREBASE.md (App Distribution, no-browser path)."
}

Write-Host "Distributing $apk to group '$group'..."
$fbArgs = @("appdistribution:distribute", $apk, "--app", $appId, "--groups", $group)
if ($useNotesFile) {
  $fbArgs += @("--release-notes-file", $notesPath)
} else {
  $fbArgs += @("--release-notes", $env:FIREBASE_RELEASE_NOTES)
}
if ($env:FIREBASE_TOKEN) {
  $fbArgs += @("--token", $env:FIREBASE_TOKEN)
}
& firebase @fbArgs

