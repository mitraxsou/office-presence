# Frame to code mapping (pre-redesign)

Source: `docs/design/SPEC.md` section 4 vs repo at branch `design/handoff`.

## Phone frames

| Frame | Current implementation |
|---|---|
| 03-06 Login | `android/.../ui/LoginActivity.kt`, `res/layout/activity_login.xml` |
| 07-11 Today | `MainActivity.kt`, `activity_main.xml` (home) |
| 12-15 Month | `ReportsActivity.kt` (code-built UI) |
| 15-23 Correction | Partial: dialog in `ReportsActivity`; no issue picker / cancel / status screens |
| 24-27 Colleagues | `PeersActivity.kt`, `activity_container.xml` |
| 28-29 You (Settings, Devices) | `SettingsActivity.kt` |
| Developer | `DeveloperActivity.kt` (menu / long-press version) |
| Admin on phone | `AdminActivity.kt` (overflow menu) |

## Web frames

| Frame | Current implementation |
|---|---|
| 30-32 Login | `web/src/app/login/page.tsx` |
| 33-35 Month / correction | `web/src/app/me/MeClient.tsx` |
| 36 Colleagues | `web/src/app/peers/PeersClient.tsx` |
| 37 Settings | `web/src/app/settings/UserSettingsClient.tsx` |
| 38-42 Roster | `web/src/app/admin/AdminClient.tsx`, `admin/page.tsx` |
| 43-46 Corrections | `AdminReportsClient.tsx` corrections section; incomplete vs handoff API |
| 47 Offices | `admin/offices/OfficesClient.tsx` |
| 48 Reports | `admin/reports/AdminReportsClient.tsx` |
| 49 Rules | `admin/settings/SettingsClient.tsx` |
| 50 Person visits | `admin/users/[id]/page.tsx` |

## Colors, fonts, strings today

- Web: `web/src/app/globals.css` (`--pwc-orange`, etc.), Helvetica-ish stacks mixed
- Android: `res/values/colors.xml`, `themes.xml`, Material 3 XML views
- Strings: `android/.../res/values/strings.xml`; many hardcoded in Kotlin/TSX

## UI strings containing "points" (representative)

- Android: `strings.xml` (`month_points`, `peer_consent`), `MainActivity`, `ReportsActivity`, `SettingsActivity`, `Notifier`, `DeveloperActivity`
- Web: `UserSettingsClient`, `MeClient`, `OfficesClient`, `AdminClient`, `layout.tsx` description, alert copy in `presence.ts` (API payload messages)

## Android toolbar overflow

- `res/menu/menu_main.xml` + `MainActivity` `toolbar.setOnMenuItemClickListener` (reports, peers, admin, settings, developer)

## Nav today vs SPEC

| SPEC | Today |
|---|---|
| Bottom: Today, Month, Colleagues, You | Overflow menu on Main |
| Web left rail | Top nav links per page |
| Force detect -> Check now | Force detect on Main (if present) |
| Developer: Version x7 | Menu item / long-press |
