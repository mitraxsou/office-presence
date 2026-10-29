/**
 * Resolve docs/releases/<versionName>.md from android/app/build.gradle.kts.
 * CLI:
 *   node scripts/android-release-notes.mjs          -> prints absolute path
 *   node scripts/android-release-notes.mjs --text   -> prints file contents
 *   node scripts/android-release-notes.mjs --version -> prints versionName
 * Exits 1 with a clear message if the notes file is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

export function readVersionName(repoRoot = root) {
  const gradlePath = path.join(repoRoot, "android", "app", "build.gradle.kts");
  if (!fs.existsSync(gradlePath)) {
    throw new Error(`Missing ${gradlePath}`);
  }
  const text = fs.readFileSync(gradlePath, "utf8");
  const match = text.match(/versionName\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Could not parse versionName from ${gradlePath}`);
  }
  return match[1];
}

export function releaseNotesPath(repoRoot = root) {
  const versionName = readVersionName(repoRoot);
  return {
    versionName,
    notesPath: path.join(repoRoot, "docs", "releases", `${versionName}.md`),
  };
}

export function loadReleaseNotes(repoRoot = root) {
  const { versionName, notesPath } = releaseNotesPath(repoRoot);
  if (!fs.existsSync(notesPath)) {
    throw new Error(
      `Missing release notes for versionName ${versionName}.\n` +
        `Create ${notesPath} before distribute or GitHub release.\n` +
        `See docs/create-github-release-apk.md and docs/design/FIREBASE.md.`
    );
  }
  return {
    versionName,
    notesPath,
    notes: fs.readFileSync(notesPath, "utf8").trim(),
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const mode = process.argv[2] || "";
    if (mode === "--version") {
      console.log(readVersionName());
    } else if (mode === "--text") {
      const { notes } = loadReleaseNotes();
      console.log(notes);
    } else {
      const { notesPath } = loadReleaseNotes();
      console.log(notesPath);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
