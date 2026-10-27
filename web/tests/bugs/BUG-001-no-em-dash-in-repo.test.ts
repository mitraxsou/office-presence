import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const SKIP = new Set(["node_modules", ".git", ".next", "build", ".gradle"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|md|json|kts|kt|xml|css|prisma|txt)$/i.test(name)) out.push(p);
  }
  return out;
}

describe("BUG-001 no em/en dash", () => {
  it("scans repo text files", () => {
    const files = walk(ROOT);
    const bad: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      if (/[\u2013\u2014]/.test(text)) bad.push(path.relative(ROOT, f));
    }
    expect(bad).toEqual([]);
  });
});
