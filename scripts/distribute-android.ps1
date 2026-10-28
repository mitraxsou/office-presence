# Upload the release APK to Firebase App Distribution (group: pilot).
# Auth: set FIREBASE_TOKEN from `firebase login:ci` on a machine with a browser,
# or use an existing firebase login / service-account ADC. Do not commit tokens.
# Also requires: assembleRelease already built, pilot group exists in Console.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
$appId = if ($env:FIREBASE_ANDROID_APP_ID) { $env:FIREBASE_ANDROID_APP_ID } else { "1:444745156088:android:0a8e8296ed2794f356420d" }
$group = if ($env:FIREBASE_DISTRIBUTE_GROUP) { $env:FIREBASE_DISTRIBUTE_GROUP } else { "pilot" }
$notes = if ($env:FIREBASE_RELEASE_NOTES) { $env:FIREBASE_RELEASE_NOTES } else { "Pilot build 2.0.1" }

if (-not (Test-Path $apk)) {
  Write-Error "Missing APK at $apk. Run: cd android; .\gradlew.bat assembleRelease"
}

if (-not $env:FIREBASE_TOKEN -and -not $env:GOOGLE_APPLICATION_CREDENTIALS) {
  Write-Host "Note: FIREBASE_TOKEN and GOOGLE_APPLICATION_CREDENTIALS are unset."
  Write-Host "If firebase CLI has no cached login, this upload will fail."
  Write-Host "See docs/design/FIREBASE.md (App Distribution, no-browser path)."
}

Write-Host "Distributing $apk to group '$group'..."
if ($env:FIREBASE_TOKEN) {
  firebase appdistribution:distribute $apk --app $appId --groups $group --release-notes $notes --token $env:FIREBASE_TOKEN
} else {
  firebase appdistribution:distribute $apk --app $appId --groups $group --release-notes $notes
}
