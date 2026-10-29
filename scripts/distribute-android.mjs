/**
 * Upload android/app/build/outputs/apk/release/app-release.apk to Firebase App Distribution.
 * Auth: FIREBASE_SERVICE_ACCOUNT_JSON env, or the same key in web/.env.local.
 * Does not write the service account to disk.
 *
 * Release notes: always loaded from docs/releases/<versionName>.md
 * (versionName from android/app/build.gradle.kts). Fails if that file is missing.
 * Optional env FIREBASE_RELEASE_NOTES overrides the file text after the file check.
 *
 * Optional env:
 *   FIREBASE_ANDROID_APP_ID (default: 1:444745156088:android:0a8e8296ed2794f356420d)
 *   FIREBASE_DISTRIBUTE_GROUP (default: pilot)
 *   FIREBASE_RELEASE_NOTES
 *   FIREBASE_TESTER_EMAILS  comma-separated emails to add to the release
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleAuth } from "google-auth-library";
import { loadReleaseNotes } from "./android-release-notes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apkPath = path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
const appId = process.env.FIREBASE_ANDROID_APP_ID || "1:444745156088:android:0a8e8296ed2794f356420d";
const group = process.env.FIREBASE_DISTRIBUTE_GROUP || "pilot";
const testerEmails = (process.env.FIREBASE_TESTER_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

function loadServiceAccount() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fromEnv) {
    return JSON.parse(fromEnv);
  }
  const envPath = path.join(root, "web", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON or create web/.env.local with that key");
  }
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON="));
  if (!line) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing from web/.env.local");
  }
  let raw = line.slice("FIREBASE_SERVICE_ACCOUNT_JSON=".length).trim();
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    raw = raw.slice(1, -1);
  }
  // Support single-line JSON or escaped JSON in .env
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.replace(/\\n/g, "\n").replace(/\\"/g, '"'));
  }
}

async function main() {
  const { versionName, notesPath, notes: fileNotes } = loadReleaseNotes(root);
  const notes = (process.env.FIREBASE_RELEASE_NOTES || fileNotes).trim();
  console.log(`versionName ${versionName}; release notes: ${notesPath}`);

  if (!fs.existsSync(apkPath)) {
    throw new Error(`Missing APK at ${apkPath}. Run: npm run android:release`);
  }

  const credentials = loadServiceAccount();
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to obtain access token from service account");

  const headers = {
    Authorization: `Bearer ${token.token}`,
    "X-Goog-User-Project": credentials.project_id,
  };

  // Ensure tester group exists (ignore already-exists)
  const groupUrl = `https://firebaseappdistribution.googleapis.com/v1/projects/${credentials.project_id}/groups?groupId=${encodeURIComponent(group)}`;
  const groupBody = {
    name: `projects/${credentials.project_id}/groups/${group}`,
    displayName: "Pilot",
  };
  const groupRes = await fetch(groupUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(groupBody),
  });
  if (groupRes.ok) {
    console.log(`Created tester group '${group}'`);
  } else {
    const errText = await groupRes.text();
    if (groupRes.status === 409 || /already exists|ALREADY_EXISTS/i.test(errText)) {
      console.log(`Tester group '${group}' already exists`);
    } else if (groupRes.status === 403) {
      console.warn(`Could not create group (${groupRes.status}): ${errText}`);
      console.warn("Create group 'pilot' in Firebase Console > App Distribution if missing.");
    } else {
      console.warn(`Group create response ${groupRes.status}: ${errText}`);
    }
  }

  // Upload APK (binary upload, then poll operation / distribute)
  const apk = fs.readFileSync(apkPath);
  console.log(`Uploading ${apkPath} (${apk.length} bytes)...`);

  const uploadUrl =
    `https://firebaseappdistribution.googleapis.com/upload/v1/projects/${credentials.project_id}/apps/${encodeURIComponent(appId)}/releases:upload`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-File-Name": "app-release.apk",
    },
    body: apk,
  });
  const uploadText = await uploadRes.text();
  if (!uploadRes.ok) {
    throw new Error(`Upload failed ${uploadRes.status}: ${uploadText}`);
  }
  const uploadJson = JSON.parse(uploadText);
  // Response may be Operation or Release
  let releaseName = uploadJson.name;
  if (uploadJson.done === false || (uploadJson.name && uploadJson.name.includes("/operations/"))) {
    releaseName = await pollOperation(headers, uploadJson.name);
  } else if (uploadJson.release) {
    releaseName = uploadJson.release.name;
  }

  if (!releaseName || !releaseName.includes("/releases/")) {
    // Some responses nest differently
    const nested = uploadJson.response?.release?.name || uploadJson.release?.name;
    if (nested) releaseName = nested;
  }
  console.log(`Release: ${releaseName}`);

  const distributeBody = {
    groupAliases: [group],
  };
  if (testerEmails.length) {
    distributeBody.testerEmails = testerEmails;
  }
  if (notes) {
    // Patch release notes first if supported
    const patchUrl = `https://firebaseappdistribution.googleapis.com/v1/${releaseName}?updateMask=releaseNotes.text`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ releaseNotes: { text: notes } }),
    });
    if (!patchRes.ok) {
      console.warn(`Release notes patch ${patchRes.status}: ${await patchRes.text()}`);
    }
  }

  const distUrl = `https://firebaseappdistribution.googleapis.com/v1/${releaseName}:distribute`;
  const distRes = await fetch(distUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(distributeBody),
  });
  const distText = await distRes.text();
  if (!distRes.ok) {
    throw new Error(`Distribute failed ${distRes.status}: ${distText}`);
  }
  console.log("Distributed to group:", group);
  if (testerEmails.length) console.log("Also invited:", testerEmails.join(", "));
  console.log("Done. Testers: Firebase Console > App Distribution, or invite email / App Tester.");
}

async function pollOperation(headers, opName) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://firebaseappdistribution.googleapis.com/v1/${opName}`, {
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Poll failed ${res.status}: ${JSON.stringify(json)}`);
    if (json.done) {
      if (json.error) throw new Error(`Upload operation error: ${JSON.stringify(json.error)}`);
      const name = json.response?.release?.name || json.response?.name;
      if (!name) throw new Error(`Unexpected operation response: ${JSON.stringify(json)}`);
      return name;
    }
    process.stdout.write(".");
  }
  throw new Error("Timed out waiting for upload operation");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
