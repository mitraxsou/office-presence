# Design handoff QA (v4 frames)

Reference: `docs/design/frames/` (78 PNGs), `docs/design/prototype.html`, SPEC sections 7-12.

## v4 additions

- [x] Frames imported (78), obsolete v2 renumbered frames removed
- [x] Admin Users CRUD + filters (web `/admin/users`)
- [x] View as another user (web banner + phone flow; readonly vs test full)
- [x] Profile (phone + web Settings)
- [x] Notifications channels + quiet hours + permission-off
- [x] Greeting on Today / My month
- [x] Migration `v4_users_viewas` on Vercel
- [x] Vitest 43 passed; OnePlus 2.0.0 (versionCode 8); prod deploy

# Prior notes (v2 exact frames)

Reference: `docs/design/frames/NN_*.png` and `docs/design/prototype.html`.
Automated diffs: `npm run test:frames` in `web/` (Playwright + pixelmatch). Diff images land in `docs/design/qa-diffs/`.

Threshold: under 1% mismatched pixels after crop, with AA ignored. Font fallback (Helvetica Neue vs Arial/Roboto) is covered by tolerance.

## Harness

- [x] Frame fixtures (`web/src/frames/fixtures.ts`)
- [x] Dev previews `/dev-frames/[frame]` (blocked in production)
- [x] Vercel production deploy (https://office-presence-psi.vercel.app)
- [x] OnePlus install 2.0.0 (versionCode 7)
- [x] Playwright config + `tests/frames/frames.spec.ts`
- [x] Android `FrameFixtures.kt` for Compose screenshot tests

## Phone (2.0.0 on OnePlus)

- [x] 03-06 Login (email, 6-box code, sending, failed)
- [x] Bottom bar Today / Month / Colleagues / You
- [x] 07-11 Today (In, Out, permissions, loading, Check now, colleagues stack)
- [x] 12-15 / 20-22 Month + day sheet + correction flow states
- [x] 16-19 Correction 3-step
- [x] 23 / 28-29 You: settings, devices, correction requests
- [x] 24-27 Colleagues In/Out / opted out / empty
- [x] UI never says "points"

## Web

- [x] Left rail 248 px, content max ~1120 px, rail footer avatar
- [x] `/` admin -> Roster, else My month
- [x] 30-37 Employee login, month drawers, colleagues, settings
- [x] 38-50 Admin roster / corrections / offices / reports / rules / person visits
- [x] Corrections pending badge on rail
- [x] UI never says "points"

## Backend (additive)

- [x] Roster filters + stats + noRecentSync
- [x] CSV export roster/reports/person
- [x] Corrections tabs, counts, phoneSync, reject note, self-decide block
- [x] Sync `correctionDecisions`
- [x] Suggest office by name + address
- [x] Soft-delete offices
- [x] `/admin/people/[id]`

## Ship

- [x] `npm test` (vitest) green
- [x] Dash grep clean on app sources
- [x] Android assembleDebug + OnePlus 2.0.0 (versionCode 7)
- [x] Frame harness runnable via `npm run test:frames` (dev-frames + pixelmatch; iterate diffs in `docs/design/qa-diffs/`)
- [x] Vercel production deploy
