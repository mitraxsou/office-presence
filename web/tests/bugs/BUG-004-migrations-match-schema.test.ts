import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "../..");
const MIG = path.join(WEB, "prisma", "migrations");

function migrationFiles() {
  return fs
    .readdirSync(MIG)
    .filter((d) => fs.statSync(path.join(MIG, d)).isDirectory())
    .sort()
    .map((d) => ({ name: d, sql: fs.readFileSync(path.join(MIG, d, "migration.sql"), "utf8") }));
}

async function columns(db: PGlite) {
  const r = await db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY table_name, column_name`,
  );
  return r.rows.map((c) => `${c.table_name}.${c.column_name}:${c.data_type}:${c.is_nullable}`);
}

async function enums(db: PGlite) {
  const r = await db.query<{ typname: string; enumlabel: string }>(
    `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid ORDER BY t.typname, e.enumlabel`,
  );
  return r.rows.map((x) => `${x.typname}.${x.enumlabel}`);
}

describe("BUG-004 migrations match prisma schema", () => {
  it("applying all migrations yields the same columns and enums as schema.prisma", async () => {
    const expectedSql = execSync(
      "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
      { cwd: WEB, encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://x@localhost/x", DIRECT_URL: "postgresql://x@localhost/x" } },
    );
    const fromSchema = new PGlite();
    await fromSchema.exec(expectedSql);
    const fromMigrations = new PGlite();
    for (const m of migrationFiles()) await fromMigrations.exec(m.sql);
    expect(await columns(fromMigrations)).toEqual(await columns(fromSchema));
    expect(await enums(fromMigrations)).toEqual(await enums(fromSchema));
  }, 120_000);

  it("copies the legacy OfficeFence row into an active 1-point OfficeLocation", async () => {
    const files = migrationFiles();
    const idx = files.findIndex((f) => f.name.includes("office_locations_points"));
    expect(idx).toBeGreaterThan(0);
    const db = new PGlite();
    for (const m of files.slice(0, idx)) await db.exec(m.sql);
    await db.exec(`
      INSERT INTO "User" (id, email, "updatedAt") VALUES ('u1', 'a@pwc.com', now());
      INSERT INTO "OfficeFence" (id, name, latitude, longitude, "radiusMeters", "setByUserId", "setAt", "updatedAt")
      VALUES (1, 'Kolkata office', 22.57, 88.36, 120, 'u1', now(), now());
    `);
    for (const m of files.slice(idx)) await db.exec(m.sql);
    const r = await db.query<{ name: string; pointsPerVisitDay: number; status: string; radiusMeters: number }>(
      `SELECT name, "pointsPerVisitDay", status::text AS status, "radiusMeters" FROM "OfficeLocation"`,
    );
    expect(r.rows).toEqual([{ name: "Kolkata office", pointsPerVisitDay: 1, status: "active", radiusMeters: 120 }]);
    const t = await db.query(`SELECT to_regclass('public."OfficeFence"') AS t`);
    expect((t.rows[0] as { t: string | null }).t).toBeNull();
    const p = await db.query<{ v: number }>(`INSERT INTO "Policy" (id, "updatedAt") VALUES (1, now()) RETURNING "monthlyPointsTarget" AS v`);
    expect(p.rows[0].v).toBe(8);
  }, 60_000);
});
