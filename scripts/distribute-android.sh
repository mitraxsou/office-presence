#!/usr/bin/env bash
# Upload the release APK to Firebase App Distribution (group: pilot).
# Prerequisites: firebase-tools logged in, assembleRelease already built, pilot group exists.
# Run on a machine with Firebase Console / CLI access (not required on every developer laptop).
# Release notes: docs/releases/<versionName>.md (required). Optional FIREBASE_RELEASE_NOTES overrides text.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${ROOT}/android/app/build/outputs/apk/release/app-release.apk"
APP_ID="${FIREBASE_ANDROID_APP_ID:-1:444745156088:android:0a8e8296ed2794f356420d}"
GROUP="${FIREBASE_DISTRIBUTE_GROUP:-pilot}"
HELPER="${ROOT}/scripts/android-release-notes.mjs"

VERSION_NAME="$(node "$HELPER" --version)"
NOTES_PATH="${ROOT}/docs/releases/${VERSION_NAME}.md"
if [[ ! -f "$NOTES_PATH" ]]; then
  echo "Missing release notes for versionName ${VERSION_NAME}." >&2
  echo "Create ${NOTES_PATH} before distribute or GitHub release." >&2
  echo "See docs/create-github-release-apk.md and docs/design/FIREBASE.md." >&2
  exit 1
fi
echo "versionName ${VERSION_NAME}; release notes: ${NOTES_PATH}"

if [[ ! -f "$APK" ]]; then
  echo "Missing APK at $APK. Run: cd android && ./gradlew assembleRelease" >&2
  exit 1
fi

echo "Distributing $APK to group '$GROUP'..."
if [[ -n "${FIREBASE_RELEASE_NOTES:-}" ]]; then
  firebase appdistribution:distribute "$APK" --app "$APP_ID" --groups "$GROUP" --release-notes "$FIREBASE_RELEASE_NOTES"
else
  firebase appdistribution:distribute "$APK" --app "$APP_ID" --groups "$GROUP" --release-notes-file "$NOTES_PATH"
fi
