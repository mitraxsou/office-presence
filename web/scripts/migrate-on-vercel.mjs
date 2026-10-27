import { execSync } from "node:child_process";

// Schema changes reach production only through the Vercel build. Local builds
// must never run migrations because web/.env.local may hold the production URL.
if (process.env.VERCEL !== "1") {
  console.log("[migrate] skipped: not a Vercel build");
  process.exit(0);
}

const env = { ...process.env };
env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.DATABASE_URL_UNPOOLED;
env.DIRECT_URL ||= env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;

execSync("npx prisma migrate deploy", { stdio: "inherit", env });
