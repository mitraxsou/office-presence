import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "../..");

describe("BUG-005 local build never migrates production", () => {
  it("build script runs migrations only through the Vercel-gated script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(WEB, "package.json"), "utf8"));
    expect(pkg.scripts.build).not.toMatch(/prisma migrate deploy/);
    expect(pkg.scripts.build).toMatch(/migrate-on-vercel/);
  });

  it("migrate-on-vercel skips when VERCEL is not set", () => {
    const env = { ...process.env };
    delete env.VERCEL;
    const out = execFileSync("node", ["scripts/migrate-on-vercel.mjs"], { cwd: WEB, env, encoding: "utf8" });
    expect(out).toMatch(/skipped/);
  });
});
