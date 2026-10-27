# Office Presence UI spec

The question every screen answers: was this person in the office long enough this month?

Frames: `docs/design/frames/NN_<Frame-name>.png`. Interactive: open `docs/design/prototype.html` in a browser.
Stack: Android Jetpack Compose with Material 3 (theme in `com.pwc.officepresence.ui.theme`); web Next.js 15, React 19, plain CSS custom properties and CSS Modules.
Tokens: `docs/design/web/tokens.css`, `docs/design/android/theme/`. Reference components: `docs/design/android/components/`, `docs/design/web/components/`.

## 1. Vocabulary change: points become days

| Old (backend field, keep as is) | New UI text |
|---|---|
| monthly target points (8) | "8 days" target, meter "5 / 8 days", "3 to go", "Goal met" |
| office points per visit day | "Counts as 1 day" / "Counts as 2 days" |
| points earned this month | "days counted" |
| visit days | "visits" |

Only UI strings change. Do not rename API fields. Add a small mapper (`formatDays(n)`, `countsAs(n)`) so screens never read the word "points".

## 2. Navigation

**Android:** remove the toolbar overflow menu. Bottom bar: Today, Month, Colleagues, You (88 dp, selected item gets an accent-wash pill and accent icon).
Map old screens: Home becomes Today; Month stays; Colleagues stays; Settings moves under You; Permissions becomes a banner on Today plus rows in You; Force detect becomes "Check now"; Developer is hidden behind tapping Version 7 times.

**Web:** left rail, 248 px. Content max 1120 px.
Employee: My month, Colleagues, Settings. Admin adds: Roster, Corrections (with pending count), Offices, Reports, Rules.
`/` redirects admins to `/admin/roster`, everyone else to `/month`. Person visits `/admin/people/[id]` is opened from rows, not the rail.

## 3. Components

| Component | Rules |
|---|---|
| Status hero | Status word 112 / 800 ("In" or "Out"), 16 px dot (green In, grey Out), office name 24 / 600, "For 2 h 32 m, since 9:42 am" (time since last change). Fades in 320 ms on change. |
| Days meter | Big number, "/ 8 days", right side "N to go" or green "Goal met" badge. One accent bar, fills once in 900 ms. No percentage. Bar never turns green. |
| Hours FYI row | Label "Hours today" + FYI tag + "Suggested 5 h a day. Does not affect days." Value in ink-2, weight 500. Never colored. |
| Badges | In (green wash), Out (sunk, grey dot), Goal met (solid green, dark text), No recent sync (accent wash), Pending review (accent wash), Approved (neutral + check), Not approved (neutral), Corrected (outlined tag). |
| Buttons | Primary: accent, dark text, pill, heights 48 / 36 / 30. Secondary: outline. Ghost: ink text, accent underline. One primary per view. |
| Colleague row | Avatar, name, office, "In since 9:15 am". Badge on right. No pin, hours, or days. |
| Roster row | Person + email, status badge with since below, office, month days mini bar "5 / 8", hours today (FYI column), last device, "View visits". |
| Office card | Name, address, radius, "Counts as N days". Selected card shows editable radius and counts as, "Save office". |

## 4. Screens and states (frame names)

Phone: Login (Email, Code, Sending code, Code failed), Today (In, Out, Permissions needed, Loading), Month (In progress, Goal met, Day detail, Day pending), Correction (Choose issue, Edit day, Review and send, Sent, Approved, Not approved), Colleagues (List, Opted out, Empty), You (Settings, Devices, Correction requests).
Web: Login (+ Sending code, Code failed), Month, Month / Day open, Month / Request a correction, Colleagues, Settings, Admin / Roster (+ Loading, Empty, Error), Admin / Corrections (+ Review, Reject, Empty), Offices, Reports, Rules, Person visits.
Dark variants exist for Today In, Month In progress, Colleagues List, Roster. All screens must work in both themes.

## 5. Correction requests

States: `pending` then `approved` | `rejected` | `cancelled`.
- Employee: day detail, "Request a correction", pick issue (missing visit, wrong times, wrong office, should not count), set office and In and Out, reason, review effect, "Send request".
- Pending: day has a dashed accent outline, totals unchanged, employee may "Cancel request".
- Admin (web only): Corrections queue, oldest first. Review shows recorded vs requested, reason, phone sync times that day, effect on the month. "Approve", "Reject" (note required), optional "Edit before approving". Hidden on the admin's own requests.
- Approved: day updates, marked Corrected, totals recalculate, original kept in history, employee notified.
- Rules: one open request per day; requests close N days after month end (default 5), then the month locks.
API proposal: `docs/design/corrections-api.md`.

## 6. Copy rules

Verbs on buttons. In and Out. "days", never "points". No em dash or en dash in any string.
Check: `rg -n "[\u2013\u2014]" --glob "*.{ts,tsx,kt,xml}"` should return nothing.

## 7. Users (web admin)

Route `/admin/users`, rail item Users (admins only). Frames: W / Admin / Users and its states.
- List: person and email, role, home office, status, phones, last seen, Edit. Filters: search, role, office, Active / Deactivated / All, Include test accounts.
- Add user: full name, PwC email (must end in @pwc.com, unique), role, home office, Test account. No invite is sent; first sign in uses the Teams code.
- Edit user: same fields, phones with Sign out device, admin activity (view-as sessions). Deactivate (default removal: signs out all phones, hides from colleagues, roster and new reports, keeps data) and Delete permanently (type the email to confirm).
- Guards: an admin cannot change their own role or deactivate or delete themselves; at least one admin must remain.

## 8. View as another user (phone, admins only)

Entry: You > Admin > View as another user. Frames: P / View as / *. Rules: Flow / View as another user.
- Real users: read only. Tracking and sync on this phone pause, write actions are disabled with a one-line reason.
- Test accounts (flagged in Users): full mode including tracking; data is stored with a test flag and excluded from roster and reports.
- Dark banner "Viewing as <name>" with time left and End on every screen. Max 30 min, ends on End, restart, or sign out.
- Other admins and deactivated users cannot be selected. Every session is logged (admin, user, mode, start, end) and shown on the user record.

## 9. Greeting

Today (phone) and My month (web) start with "Good morning / afternoon / evening, <name>" and the date, above the status.
Name: preferred name, else first name. Morning before 12:00, afternoon 12:00 to 17:00, evening after 17:00, in Asia/Kolkata.
The greeting is 22 / 600, never heavier than the status word.

## 10. Profile

Phone: You > Profile. Web: Settings > Profile (default section).
Fields: first name and last name (required, 1 to 40), preferred name (optional, up to 30), "Show me to colleagues as" (First and last, Preferred and last, Preferred only), email read only.
Preview shows the greeting and the colleague name before saving. Admins can edit the same fields in Users.

## 11. Notifications

Phone: You > Notifications. Web: Settings > Notifications (same server preferences).
Types, one Android NotificationChannel each: Arrivals and leaving, Goal met, Weekly summary, Correction requests, Tracking problems (recommended).
Quiet hours with start and end; tracking problems still alert.
Sound and vibration are per channel and owned by Android: read and display them from the channel, open ACTION_CHANNEL_NOTIFICATION_SETTINGS to change, and offer "Send test notification".
If POST_NOTIFICATIONS is denied, show the "Notifications are off" banner and disable the switches.

## 12. View as on the web

Users rows show "View as" for active non-admin users. A dark banner sits above the whole app for the session; the rail is the viewed user's. Same rules as the phone (read only for real users, 30 min, logged). Admin pages are hidden during the session.

## 13. Several offices in one day

Frames: P / Today / In, second office; P / Month / Day with several offices; W / Month / Day with several offices; W / Admin / Person visits.
- Group visits by office in order of first arrival. Office time = sum of its visits. Total in office = sum of all visits; travel between offices is not counted and is shown as one line of text.
- The day counts once. If the offices have different "Counts as" values, the day counts at the highest value (confirm with backend; display whatever the server returns).
- Timeline: 8 am to 8 pm (extend if a visit is outside), neutral tones only (ink for the first office, ink-3 for the second, ink-2 for a third). Orange is never used for time.
- Today after a move: hero shows the current office and time since arriving there; a "Today, N offices" card lists each office with its time and the hours today total (FYI).
- Web calendar cell shows "2 offices" instead of an office name.

## 14. Office editing (admin)

- Name, address, radius, and counts as are editable. Rename keeps the office id, so past visits, reports, and colleague views show the new name. Personal nicknames stay. Name must be unique.
- Coordinates show as read-only info with Copy, 5 decimals, taken from the map pin. Moving the pin is the only way to change them.

## 15. Admin direct edits (no approval)

Frames: W / Admin / Person visits and its Edit day, Add visit, Saved, Change history, Own record states; W / Admin / Users / Edit user, full and Saved.
- Admins can change any visit's office, In and Out, add or remove visits, add a missing day, or stop a day from counting. Changes apply on Save with no approval step.
- A reason is required for visit edits and is stored with before and after values in Change history (read only, exportable).
- Edited days show "Edited by admin" everywhere, including the employee's Month. "Tell <name> about this change" is on by default.
- Saving an edit on a day with a pending correction closes that request as "Resolved by admin".
- Admins cannot edit their own visits or their own role. The server enforces this.
- Users: admins edit first, last and preferred name, display format, email, role, home office, test flag and sharing directly. Changing the email signs out all phones.

## 16. Responsive web (mobile friendly)

Frames: Responsive / Breakpoints and every M / ... frame (390 wide).
- Up to 719 px: bottom bar. Employee: My month, Colleagues, Settings. Admin: My month, Roster, Corrections (count), More (sheet: Users, Offices, Reports, Rules, Colleagues, Settings).
- Tables become card lists; drawers become full-screen pages with a sticky action bar; filters go into a sheet behind chips; count strips become 2 by 2.
- 720 to 1099 px: rail collapses to 72 px icons; tables drop Phone and Last seen.
- 1100 px and up: the desktop layout.
- Use CSS container or media queries in the CSS Modules; do not fork pages. Touch targets 44 px, inputs 16 px text, sticky bars use env(safe-area-inset-bottom). Sheet and drawer state stays in the URL.
