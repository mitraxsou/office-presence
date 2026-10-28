import fs from "fs";
import { spawnSync } from "child_process";

const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/^CRON_SECRET=(.*)$/m);
if (!m) {
  console.error("CRON_SECRET missing in .env.local");
  process.exit(1);
}
const secret = m[1].trim().replace(/^["']|["']$/g, "");
const r = spawnSync("npx", ["vercel", "env", "add", "CRON_SECRET", "production"], {
  input: `${secret}\n`,
  encoding: "utf8",
  shell: true,
});
const out = `${r.stdout || ""}${r.stderr || ""}`.replaceAll(secret, "[redacted]");
console.log(`exit=${r.status}`);
console.log(
  out
    .split("\n")
    .filter(Boolean)
    .slice(-8)
    .join("\n"),
);
process.exit(r.status ?? 1);
