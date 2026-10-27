---
name: no-local-prod-db
description: >-
  Do not connect to the production database from this laptop. Prefer Vercel
  CLI logs when diagnosing production.
---

# No local production database

1. Never open Prisma or `pg` against production `DATABASE_URL` from this workspace.
2. Do not invent DB tunnels or keep retrying prod after timeouts.
3. Tests use PGlite or a dedicated local/dev database.
4. Prefer `npx vercel logs` / `npx vercel inspect` with a session token.
