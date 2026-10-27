---
name: office-presence
description: >-
  Office Presence phone app plus its own Next.js backend. Use when developing
  the Android app, web dashboard, visit math, Teams OTP, or deploy for this repo.
---

# Office Presence

Pilot: track office hours from a phone (Android first). Own backend. Separate from Office Pulse.

## Architecture

```
Android app -> POST /api/ingest -> Postgres
Web dashboard <- session cookie
Teams OTP via Power Automate (Teams only, no email OTP)
```

- Local web: `web/` with `.env.local`, `npm run dev`
- Deploy: new Vercel hobby project, new Neon database
- Do not reuse Office Pulse Vercel project or production database

## Rules (defaults; admin-configurable)

| Setting | Default |
|---|---|
| Gap that ends a visit | 15 minutes |
| Day hours target | 5 |
| Monthly office days | 8 |
| Timezone | Asia/Kolkata |
| Sample interval | 5 minutes |
| Fence radius | 100 m |

Weak fixes (accuracy worse than fence radius) do not count. Simulated events never count toward a real day.

## Security

- Device tokens: bcrypt hashes; plain token shown once
- OTP: Teams only via Power Automate; rate limited
- Admin routes: `requireAdmin()`
- Never commit `.env.local` or secrets
- Never connect to production Postgres from this laptop

## UI / copy

- PwC orange `#FD5108`, dark `#1A1A1A` / `#2D2D2D`
- No em dash or en dash (see no-em-dash skill)
- Verb-first buttons ("Check in", "Send code")

## Tests before done

1. `npm run test:all` at repo root
2. `npm run test:bugs` for the regression catalog
3. No production DATABASE_URL in local test setup
