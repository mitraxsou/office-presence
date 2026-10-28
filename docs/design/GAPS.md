# Design gaps (v8 audit)

Sources: `docs/design/SPEC.md` (sections 1-16), `docs/design/frames/*.png` (110 frames from handoff v8), `docs/design/corrections-api.md`, `.cursor/rules/*.mdc`.

Handoff import (2026-10-27): replaced design frames (78 pre-v8 backed up in `docs/design/frames-pre-v8/`), SPEC, prototype, corrections-api, PROMPT-AUDIT, android/web design references, and `.cursor/rules` from `office-presence-cursor-handoff-v8.zip`. App code was not rewritten from the handoff; only UI string/token defect fixes listed under Known defects.

## Frame table

| Frame | Platform | File(s) | Status | What differs |
|---|---|---|---|---|
| 01_Foundations | Ref | N/A | done | Reference only (tokens/components). |
| 02_Flow-Correction-request | Ref | N/A | done | Flow diagram only. |
| 03_Flow-View-as-another-user | Ref | N/A | done | Flow diagram only. |
| 04_Responsive-Breakpoints | Ref | N/A | done | Breakpoint spec only. |
| 05_P-Login-Email | Android | `ui/LoginActivity.kt` | partial | Layout/copy vs v8; password branch is extra. |
| 06_P-Login-Code | Android | `LoginActivity.kt` | partial | Digit UI / tries copy vs frame. |
| 07_P-Login-Sending-code | Android | `LoginActivity.kt` | partial | Button loading state, not dedicated screen. |
| 08_P-Login-Code-failed | Android | `LoginActivity.kt` | partial | Error banner present; visual vs v8. |
| 09_P-Today-In | Android | `compose/TodayScreen.kt`, `ShellActivity.kt` | partial | Core IA matches; pixel polish vs frame. |
| 10_P-Today-In-Dark | Android | `TodayScreen.kt` + theme | partial | Theme works; pixel match unfinished. |
| 11_P-Today-In-second-office | Android | `TodayScreen.kt` | done | `TodayOfficesCard` from reports `today.offices` when 2+ offices. |
| 12_P-Today-In-real-data-check | Android | `TodayScreen.kt` | partial | Checking spinner only; no dedicated check UI. |
| 13_P-Today-Out | Android | `TodayScreen.kt` | partial | Out hero/copy vs v8. |
| 14_P-Today-Permissions-needed | Android | `TodayScreen.kt` | partial | Permissions block exists; layout vs frame. |
| 15_P-Today-Loading | Android | `TodayScreen.kt` | partial | Skeleton exists; content vs frame. |
| 16_P-Month-In-progress | Android | `compose/MonthScreen.kt` | partial | Calendar/summary vs v8. |
| 17_P-Month-In-progress-Dark | Android | `MonthScreen.kt` + theme | partial | Dark via theme; not pixel-matched. |
| 18_P-Month-Goal-met | Android | `MonthScreen.kt`, `OpComponents.kt` | partial | Goal met label exists; composition vs frame. |
| 19_P-Month-Day-detail | Android | `MonthScreen.kt` | partial | Flat visit list; no office timeline. |
| 20_P-Correction-Choose-issue | Android | `MonthScreen.kt` | partial | Issue picker present; steps/UI vs v8. |
| 21_P-Correction-Edit-day | Android | `MonthScreen.kt` | partial | Edit fields exist; form chrome vs frame. |
| 22_P-Correction-Review-and-send | Android | `MonthScreen.kt` | partial | Preview/effect step partial vs frame. |
| 23_P-Correction-Sent | Android | `MonthScreen.kt` | partial | Sent confirmation thin vs frame. |
| 24_P-Month-Day-with-several-offices | Android | `MonthScreen.kt` | done | Groups by office + travel copy + `DayOfficeTimeline` 8am-8pm bars. |
| 25_P-Month-Day-pending | Android | `MonthScreen.kt` | partial | Pending badge/cancel; dashed cell vs frame. |
| 26_P-Correction-Approved | Android | `MonthScreen.kt` | partial | Approved badge/copy; layout vs frame. |
| 27_P-Correction-Not-approved | Android | `MonthScreen.kt` | partial | Reject note + request again; UI vs frame. |
| 28_P-You-Correction-requests | Android | `compose/YouScreen.kt` | partial | List + badges; grouping/close copy vs frame. |
| 29_P-You-Settings-Admin | Android | `YouScreen.kt` | partial | Admin rows (view-as, console); IA vs v8. |
| 30_P-View-as-Choose-user | Android | `compose/ViewAsScreens.kt` | partial | Choose + search; list chrome vs frame. |
| 31_P-View-as-Confirm | Android | `ViewAsScreens.kt` | partial | Confirm sheet; copy/buttons vs frame. |
| 32_P-View-as-Confirm-test-account | Android | `ViewAsScreens.kt` | partial | Test vs read-only branching exists. |
| 33_P-View-as-Today | Android | `ViewAsBanner.kt` + `TodayScreen.kt` | partial | Banner + disabled Check now; layout vs frame. |
| 34_P-View-as-Month-read-only | Android | `ViewAsBanner.kt` + `MonthScreen.kt` | partial | Correction gated; chrome vs frame. |
| 35_P-View-as-Test-account | Android | `ViewAsScreens.kt` + banner | partial | Full mode for test; UI vs frame. |
| 36_P-View-as-Ended | Android | `ShellActivity.kt`, `OpNoticeBanner` | done | Toast on End, switches to You with duration copy. |
| 37_P-Colleagues-List | Android | `compose/ColleaguesScreen.kt` | partial | In/Out lists; row chrome vs v8. |
| 38_P-Colleagues-List-Dark | Android | `ColleaguesScreen.kt` + theme | partial | Dark via theme. |
| 39_P-Colleagues-Opted-out | Android | `ColleaguesScreen.kt` | partial | Opt-in CTA exists; layout vs frame. |
| 40_P-Colleagues-Empty | Android | `ColleaguesScreen.kt` | partial | Empty state exists; copy vs frame. |
| 41_P-You-Settings | Android | `YouScreen.kt` | partial | Settings hub; rows/order vs v8. |
| 42_P-You-Profile | Android | `compose/ProfileScreen.kt` | partial | Profile fields + preview; chrome vs frame. |
| 43_P-You-Profile-Error | Android | `ProfileScreen.kt` | partial | Field errors; not full-page error frame. |
| 44_P-You-Notifications | Android | `compose/NotificationsScreen.kt` | partial | Prefs + channels; layout vs frame. |
| 45_P-You-Notifications-Sound-and-vibration | Android | `NotificationsScreen.kt` | partial | Channel detail + system settings deep-link. |
| 46_P-You-Notifications-Permission-off | Android | `NotificationsScreen.kt` | partial | Permission-off path; banner vs frame. |
| 47_P-Notifications-Lock-screen | Android | `notify/Notifier` (system UI) | partial | App owns channels/content; lock chrome is OS. |
| 48_P-You-Devices | Android | `YouScreen.kt` | partial | Devices list/sign-out; chrome vs frame. |
| 49_M-Login | Web | `app/login/page.tsx` | partial | Login has no shell/bottom bar (correct); responsive polish vs frame. |
| 50_M-Month | Web | `MobileBottomNav`, `MeClient.tsx` | partial | Bottom bar under 719 px; calendar still desktop-scaled. |
| 51_M-Month-Day-detail | Web | `MeClient.tsx` drawer | done | Under 719 px drawers are full-screen with sticky action bar. |
| 52_M-Colleagues | Web | `MobileBottomNav` | partial | Bottom bar entry; list chrome vs M frame. |
| 53_M-Settings | Web | `MobileBottomNav` | partial | Bottom bar entry; layout vs M frame. |
| 54_M-Admin-Roster | Web | `MobileBottomNav`, `AdminClient.tsx` | done | Roster tab + tables-as-cards under 719 px. |
| 55_M-Admin-Roster-Filters | Web | `AdminClient.tsx` | done | Filter chips open a bottom sheet on mobile. |
| 56_M-Admin-More | Web | `MobileBottomNav.tsx` | done | More sheet: Admin + You links + Sign out. |
| 57_M-Admin-Person-visits | Web | `admin/people/[id]/*` | done | Person visits uses shared mobile table-card + full-screen drawers. |
| 58_M-Admin-Edit-day | Web | `PersonVisitsClient.tsx` | done | Edit day drawer (desktop + mobile sticky actions). |
| 59_M-Admin-Corrections | Web | `admin/corrections/*` | missing | No bottom-bar Corrections tab. |
| 60_M-Admin-Corrections-Review | Web | `CorrectionsClient.tsx` | done | Shared full-screen sticky drawer CSS under 719 px. |
| 61_M-Admin-Users | Web | `admin/users/*` | missing | Buried in rail; no More entry. |
| 62_M-Admin-Edit-user | Web | `UsersClient.tsx` | done | Shared full-screen sticky drawer CSS under 719 px. |
| 63_M-Admin-Offices | Web | `admin/offices/*` | missing | No mobile offices IA. |
| 64_M-Admin-Edit-office | Web | `OfficesClient.tsx` | missing | No mobile edit-office page. |
| 65_M-Admin-Reports | Web | `admin/reports/*` | missing | No mobile reports IA. |
| 66_M-Admin-Rules | Web | `admin/settings/*` | missing | No mobile rules IA. |
| 67_M-View-as-My-month | Web | `AppShell` + month + banner | missing | View-as works; no M chrome. |
| 68_W-Login | Web | `app/login/page.tsx` | partial | OTP/password; layout vs v8. |
| 69_W-Login-Sending-code | Web | `login/page.tsx` | partial | Busy on send; not dedicated frame. |
| 70_W-Login-Code-failed | Web | `login/page.tsx` | partial | Delivery-failed path; chrome vs frame. |
| 71_W-Month | Web | `month/page.tsx`, `me/MeClient.tsx` | partial | Month + greeting; calendar vs v8. |
| 72_W-Month-Day-open | Web | `MeClient.tsx` | partial | Day drawer; content vs frame. |
| 73_W-Month-Day-with-several-offices | Web | `MeClient.tsx`, `lib/office-day.ts`, `DayTimeline` | done | Calendar "N offices"; grouped drawer + 8am-8pm timeline. |
| 74_W-Month-Request-a-correction | Web | `MeClient.tsx` | partial | Correction flow; steps vs frame. |
| 75_W-Colleagues | Web | `colleagues/page.tsx` | partial | List/opt-in; chrome vs v8. |
| 76_W-Settings-Profile | Web | `settings/UserSettingsClient.tsx` | partial | Profile section; layout vs frame. |
| 77_W-Settings-Notifications | Web | `UserSettingsClient.tsx` | partial | Prefs via `/api/me/notification-prefs`. |
| 78_W-Settings-Sharing-and-devices | Web | `UserSettingsClient.tsx` | partial | Sharing/devices; chrome vs frame. |
| 79_W-Admin-Roster | Web | `admin/roster`, `AdminClient.tsx` | partial | Roster live; columns/chrome vs v8. |
| 80_W-Admin-Roster-Dark | Web | `AdminClient.tsx` + theme | partial | Dark via theme. |
| 81_W-Admin-Roster-Loading | Web | `AdminClient.tsx` | partial | Skeleton path exists. |
| 82_W-Admin-Roster-Empty | Web | `AdminClient.tsx` | partial | Empty universe state exists. |
| 83_W-Admin-Roster-Error | Web | `AdminClient.tsx` | partial | Error banner + faded data. |
| 84_W-Admin-Corrections | Web | `admin/corrections/CorrectionsClient.tsx` | partial | Queue + tabs; chrome vs frame. |
| 85_W-Admin-Corrections-Review | Web | `CorrectionsClient.tsx` | partial | Review + sync times + edit-before. |
| 86_W-Admin-Corrections-Reject | Web | `CorrectionsClient.tsx` | partial | Note-required reject; modal vs frame. |
| 87_W-Admin-Corrections-Empty | Web | `CorrectionsClient.tsx` | partial | Empty copy exists. |
| 88_W-Admin-Users | Web | `admin/users/UsersClient.tsx` | partial | List/filters; chrome vs frame. |
| 89_W-Admin-Users-View-as | Web | `UsersClient.tsx` | partial | View as modal + start. |
| 90_W-View-as-My-month | Web | `AppShell.tsx`, `ViewAsBanner.tsx` | partial | Banner + employee rail while viewing. |
| 91_W-View-as-Read-only | Web | `MeClient.tsx`, `UserSettingsClient.tsx` | partial | Writes disabled with reason. |
| 92_W-View-as-Ended | Web | `UsersClient.tsx` | partial | Toast on return; no dedicated ended page. |
| 93_W-Admin-Users-Add-user | Web | `UsersClient.tsx` | partial | Add drawer; fields vs frame. |
| 94_W-Admin-Users-Email-in-use | Web | `UsersClient.tsx` + API | partial | 409/conflict handling; UI vs frame. |
| 95_W-Admin-Users-Edit-user | Web | `UsersClient.tsx` | partial | Edit drawer; incomplete vs full frame. |
| 96_W-Admin-Users-Edit-user-full | Web | `UsersClient.tsx` | partial | Phones/view-as history partial. |
| 97_W-Admin-Users-Saved | Web | `UsersClient.tsx` | partial | Inline saved msg; not framed state. |
| 98_W-Admin-Users-Deactivate | Web | `UsersClient.tsx` | partial | Deactivate modal exists. |
| 99_W-Admin-Users-Delete | Web | `UsersClient.tsx` | partial | Delete confirm with email. |
| 100_W-Admin-Users-No-results | Web | `UsersClient.tsx` | partial | Empty-filter copy exists. |
| 101_W-Admin-Offices-list-plus-map | Web | `admin/offices/OfficesClient.tsx` | partial | List+map; chrome vs frame. |
| 102_W-Admin-Offices-Rename | Web | `OfficesClient.tsx` + API | partial | Name editable on save; no dedicated rename chrome. |
| 103_W-Admin-Reports | Web | `admin/reports/AdminReportsClient.tsx` | partial | Reports page; composition vs frame. |
| 104_W-Admin-Rules | Web | `admin/settings/SettingsClient.tsx` | partial | Rules incl. correction window. |
| 105_W-Admin-Person-visits | Web | `admin/people/[id]/PersonVisitsClient.tsx` | done | Day groups, Edit day / Add visit / History actions. |
| 106_W-Admin-Person-visits-Edit-day | Web | `PersonVisitsClient.tsx` + API | done | Edit day drawer; `PUT /api/admin/people/:id/days/:date`. |
| 107_W-Admin-Person-visits-Add-visit | Web | `PersonVisitsClient.tsx` + API | done | Add visit drawer; `POST /api/admin/people/:id/visits`. |
| 108_W-Admin-Person-visits-Saved | Web | `PersonVisitsClient.tsx` | done | Toast after save with notify / request-closed copy. |
| 109_W-Admin-Person-visits-Change-history | Web | `PersonVisitsClient.tsx` + API | done | History drawer; `GET /api/admin/people/:id/history`. |
| 110_W-Admin-Person-visits-Own-record | Web | `PersonVisitsClient.tsx` | done | Own-record banner; edit actions hidden; server 403 on self-edit. |

## Known defects

| Defect | Status | Note |
|---|---|---|
| Phone "Updated N min ago" next to wordmark / wraps | fixed (prior) | Lives under status via `StatusHero` `updatedLabel` in `TodayScreen.kt`. |
| Greeting uses email local part | fixed (prior) | `OpFormat.greetingName` uses preferred, first, then email-before-dot capitalised. |
| Status word "In." with period character | fixed (prior) | `StatusHero` renders `"In"` / `"Out"` + 16 dp dot. |
| "For X, since Y" missing under office | fixed (prior) | `OpFormat.forSinceLabel` wired into `StatusHero`. |
| Check now filled orange primary | fixed (prior) | `OpSecondaryButton` in row with colleagues text. |
| Dynamic color / surfaceTint pink tint | fixed (prior) | `Theme.kt` sets `surfaceTint = Transparent`; dynamic color off. |
| Web count strip wraps 2x2 on desktop | fixed (this pass) | `globals.css`: 2x2 only under 719 px; desktop stays one row. |
| Include test accounts checkbox oversized / wraps | fixed (this pass) | `.op-chk` 16 px input + `white-space: nowrap`. |
| Admin shown twice (tag + Role column) | fixed (this pass) | Removed Admin tag beside name in `UsersClient.tsx`; Role column remains. Test tag kept when test. |
| Home office shows "-" instead of "Not set" | fixed (this pass) | `UsersClient.tsx` empty home office -> `"Not set"`. |
| Rail group labels ALL CAPS / "YOU" | fixed (this pass) | Removed "You" section; "Admin" sentence case; dropped `text-transform: uppercase`. |
| UI strings "points" / "checked in" / em or en dash | fixed (this pass) | Legacy XML/Compose UI + alert copy updated to days; no em/en dash in `ts/tsx/kt/xml`; BUG-001 passes. API field names still say points. |
| Hardcoded hex in screens | partial | `ViewAsBanner.kt` now uses `OpDark`/`OpLight`. Token files keep hex by design. Legacy `.btn-danger` / `.status-msg.error` remapped to neutrals (no red). |

## Backend (corrections-api.md)

| Spec endpoint | Status | Actual |
|---|---|---|
| `POST /api/corrections` | partial | `POST /api/me/corrections` |
| `GET /api/corrections?mine=1&month=` | partial | `GET /api/me/corrections?month=` |
| `POST /api/corrections/:id/cancel` | partial | `POST /api/me/corrections` body `{ action: "cancel", id }` |
| `GET /api/corrections/preview` | partial | `GET /api/me/corrections/preview` |
| `GET /api/admin/corrections` | done | `GET /api/admin/corrections` |
| Approve / reject | partial | `POST /api/admin/corrections` `{ id, decision }` |
| `GET /api/admin/corrections/count` | partial | `GET /api/admin/corrections?count=1` |
| `correction_window_days` on rules | done | `policy.correctionWindowDays` |
| Users CRUD / deactivate / delete | partial | `/api/admin/users` + `[id]`; reactivate via PATCH |
| View-as start/end | done | `/api/admin/view-as`, `/end`, `/status` |
| `GET/PATCH /api/me/profile` | done | `/api/me/profile` |
| `GET/PATCH /api/me/notifications` | partial | `/api/me/notification-prefs` |
| Day detail `offices[]` grouping | done | `computeUserMonth` days include `offices[]`, `travel_minutes`, `total_minutes`; reports `today.offices` |
| `PUT /api/admin/people/:userId/days/:date` | done | Replaces day visits; closes pending as cancelled + "Resolved by admin" |
| `POST /api/admin/people/:userId/visits` | done | Additive person visits endpoint (legacy `/api/admin/visits` kept) |
| `GET /api/admin/people/:userId/history` | done | Audit log projection for person edits |
| `PATCH /api/admin/offices/:id` | partial | `PATCH /api/admin/offices` (body id) |

## Proposed batches

### Batch A: tokens, theme, strings, known defects
- [x] Sync v8 tokens/theme references into `docs/design` and `web/src/app/tokens.css` - design handoff tokens applied.
- [x] Banned UI strings (points / checked in / dashes) - `ReportsActivity`, `MainActivity`, `DeveloperActivity`, `presence.ts` alerts; BUG-001 green.
- [x] Known web defects (strip, checkbox, Admin tag, Not set, rail case) - `globals.css`, `AppShell.tsx`, `UsersClient.tsx`.
- [x] Hardcoded screen hex where cheap - `ViewAsBanner.kt`, error/danger CSS neutrals.
- Acceptance: no em/en dash in UI sources; no user-visible "points" or "checked in"; known defects checklist above.

### Batch B: shared components
- [x] DaysMeter / Goal met badge / accent bar - `OpComponents.kt` GoalMetBadge + check; web `DesignKit.DaysMeter` uses `op-days-num` + Goal met badge; bar stays accent.
- [x] StatusBadge (In/Out ink text, 8 dp dots, 24 px) - Android StatusBadge + PendingBadge; web StatusBadge kinds + dots in DesignKit / globals.
- [x] HoursFyiRow - unchanged contract; DesignKit caption/value aligned to SPEC.
- [x] StatusHero 112 / motion - Android uses `OpType.Status` + 320 ms fade/rise; web status word + 16 px dot order.
- [x] Buttons / ghost link - primary 48, secondary pill, ghost underline; Previews light/dark/font 1.3.
- [x] Bottom bar - selected wash + accent icon, selected label ink (`ShellActivity.kt`).
- [x] Rail - Admin sentence case / no You (Batch A); left as-is.
- Acceptance: components match frames in light/dark; pages do not restyle them.

### Batch C: phone screens
- [x] Today Out last-In + Updated meta (frame 13) - `StatusHero` combines "Last In at X. Updated Y" when Out.
- [x] StatusHero size/motion (frames 09-13) - done with Batch B (`OpType.Status` + animation).
- [x] View-as ended notice (frame 36) - `OpNoticeBanner` on End, switch to You; `viewAsStartedAtMs` for duration.
- [x] Multi-office Today/Month (frames 11, 24) - TodayOfficesCard + DayOfficeTimeline; reports `today.offices`.
- [ ] Remaining phone pixel polish (Login, Correction steps, Colleagues/You chrome) - still partial vs frames; core IA present.
- Acceptance: each frame has loading/empty/error where SPEC lists them; font scale 1.3.

### Batch D: web desktop screens
- [x] Multi-office month day (frame 73) - `office-day.ts` + MeClient calendar label and grouped drawer.
- [x] DesignKit shared components wired (Batch B) for desktop screens.
- [x] Person visits edit / add / history / saved (frames 105-110) - APIs + PersonVisitsClient drawers.
- [ ] Remaining desktop pixel polish (Login, Roster columns, Corrections, Users chrome) - still partial.
- Acceptance: 1440 and 1024 light/dark match frames.

### Batch E: mobile web (responsive)
- [x] Bottom bar + More sheet (SPEC 16, frames 49-56) - `MobileBottomNav.tsx` + AppShell; rail hidden under 719 px; admin More sheet (Users/Offices/Reports/Rules + Colleagues/Settings + Sign out).
- [x] Count strip 2x2 under 719 - already in Batch A.
- [x] Tables-as-cards and full-screen drawers with sticky actions - globals under 719 px; roster filter sheet.
- Acceptance: 390 px light/dark; tables become cards; drawers full-screen.

### Batch F: backend additions then dependent screens
- [x] Multi-office grouping from existing interval `officeName` (client) - web + Android Month day detail; no API rename.
- [x] Own-record notice on person visits (frame 110) - `isOwnRecord` banner; edit endpoints still to build.
- [x] Canonical day detail `offices[]` / travel_minutes on reports API.
- [x] People day edit / add visit / history APIs + UI (frames 106-109).
- [ ] Path aliases aligning `/api/corrections` with existing `/api/me/corrections` (optional).
- Acceptance: endpoints exist; screens use them; no API field renames for points.

## Handoff v12 (2026-10-28)

- SPEC §§17-23, frames, `OpMotion.kt`, Today-Day-Motion PDF, and motion MP4 ingested into `docs/design/`.
- Points wording (§§19-20): meter uses points; visit days FYI; office weights from API (migration sets Gurugram/Pune = 4, Kolkata/Bengaluru = 1 by name).
- Today (§21): Today card (points, visit rows, Hours FYI) + compact month line opens Month tab.
- Month day detail (§21): points badge + Visits / Hours or Offices / First In / Last Out stats (Android + web drawer).
- Motion (§22): `ui/compose/OpMotion.kt` wired into StatusHero and DaysMeter (reduced-motion aware).
- §23 status word options still deferred.

## Firebase FCM + Analytics (2026-10-28)

Shipped: FCM force-logout on admin delete/deactivate, `DeviceToken.fcmToken`, Android MessagingService + Analytics/Performance (Spark). Work-hours `presence_check` ping via `/api/cron/presence-ping` + `CRON_SECRET` (external hourly cron; Hobby Vercel cron is daily-only). BootReceiver restarts FGS if still In. See `docs/design/FIREBASE.md`. Force stop still needs a manual app open.

## Year + refresh (2026-10-28)

Shipped: Year tab (Android + web), `GET /api/me/year` + `year-stats`, admin-only Colleagues nav, refresh rules (Today/Month/Year stale paths, daily `SyncRefreshWorker`), design PDF at `docs/design/Office-Presence-Year-and-refresh.pdf`.

Remaining gaps vs Year/refresh PDF and SPEC:

- Dirty-month push not wired to FCM yet (FCM used for force-logout first; client still refreshes on open).
- Web Colleagues freshness is lighter than the 15 min phone rule (no matching stale-cache UX).
- Offline Sync is cooldown-only (no richer offline queue UX).
- Heatmap month-tap is approximate (opens Month near that region, not a precise day cell).

## Performance and settings notes (2026-10-27)

- Month on phone: `GET /api/me/reports` skips `recomputeUserPresence` for past months; current-month stale path reuses one recompute (no double `computeForRange`). `MonthScreen` loads reports and corrections in parallel and uses cached `prefs.offices()` (no third offices fetch).
- Notification channel detail (frame 45): Vibrate, Pop on screen, Show on lock screen, and Override DND open Android channel settings; values refresh on resume. Sound stays in-app.
- Office nicknames: Compose You > Office nicknames rows are editable via dialog + `PUT /api/me/aliases`.
- Admin Users drawer: per-device Recent API activity from `DeviceApiActivity` (`GET /api/admin/users/[id]/api-activity`).

## Top remaining gaps

1. Pixel polish across remaining partial phone and desktop screens (Login, Correction steps, Colleagues/You, Roster columns) - not blocking; core IA and SPEC states present.
2. Optional path aliases `/api/corrections` -> `/api/me/corrections`.
3. Some M-* admin pages (Users/Offices/Reports/Rules IA) still share desktop layouts via responsive CSS rather than dedicated mobile compositions.

## Fixes applied this pass (summary)

- Imported v8 design source of truth (110 frames, SPEC, prototype, tokens, rules).
- UI copy: days not points in legacy Android screens and Teams alert messages.
- Web: rail case, count-strip breakpoint, Users Not set / Admin tag, checkbox size, no-red error styles.
- Android: `ViewAsBanner` uses palette tokens instead of raw hex.
- `npm test -- tests/bugs/BUG-001-no-em-dash-in-repo.test.ts` passed.
