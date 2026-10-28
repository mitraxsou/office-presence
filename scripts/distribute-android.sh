#!/usr/bin/env bash
# Upload the release APK to Firebase App Distribution (group: pilot).
# Prerequisites: firebase-tools logged in, assembleRelease already built, pilot group exists.
# Run on a machine with Firebase Console / CLI access (not required on every developer laptop).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${ROOT}/android/app/build/outputs/apk/release/app-release.apk"
APP_ID="${FIREBASE_ANDROID_APP_ID:-1:444745156088:android:0a8e8296ed2794f356420d}"
GROUP="${FIREBASE_DISTRIBUTE_GROUP:-pilot}"
NOTES="${FIREBASE_RELEASE_NOTES:-Pilot build 2.0.1}"

if [[ ! -f "$APK" ]]; then
  echo "Missing APK at $APK. Run: cd android && ./gradlew assembleRelease" >&2
  exit 1
fi

echo "Distributing $APK to group '$GROUP'..."
firebase appdistribution:distribute "$APK" --app "$APP_ID" --groups "$GROUP" --release-notes "$NOTES"
