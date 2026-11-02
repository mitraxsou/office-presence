# Correction requests: proposed backend addition

This is the only backend change the redesign needs. It is additive: existing visits, sync, and reports keep working. Agree it with the backend owner before building UI against it.

## Table `correction_requests`

| column | type | notes |
|---|---|---|
| id | uuid | |
| user_id | fk users | requester |
| day | date | in the office timezone (default Asia/Kolkata) |
| issue | enum | `missing_visit`, `wrong_times`, `wrong_office`, `should_not_count` |
| recorded | jsonb | snapshot of the day's visits when sent |
| requested | jsonb | `{ office_id, in_at, out_at }` or `{ remove: true }` |
| reason | text | required |
| status | enum | `pending`, `auto_approved`, `approved`, `rejected`, `cancelled`, `reverted`, `undone` |
| decided_by | fk users, null | admin |
| decided_at | timestamptz, null | |
| decision_note | text, null | required when rejected |
| applied | jsonb, null | final values if the admin edited before approving |
| created_at | timestamptz | |

Constraints: one `pending` row per (user_id, day). Reject create if the month is locked (day's month end + `correction_window_days` has passed). `decided_by` must not equal `user_id`.

Approving writes a visit (or removes one) marked `source = 'correction'` with `correction_id`, and keeps the original rows. Day totals and reports recalculate from visits as today.

## Endpoints

Employee
- `POST /api/corrections` body `{ day, issue, requested, reason }` (alias `POST /api/me/corrections`). `requested` is `{ office_id, in_at, out_at }` (`out_at` null means Still In), `{ remove: true }`, or `{ visits: [{ office_id, in_at, out_at }] }` for Fix today.
- Response: `outcome` is `auto_approved` (the visit change is already applied) or `pending`, plus `reason` when pending, and `effect: { days_before, days_after }`.
- `GET /api/corrections/preview` (alias `GET /api/me/corrections/preview`) returns the same `outcome` and `reason` without writing, so the button can say "Save correction" or "Send for approval" before submit. Fix today uses "Save changes" when the outcome is `auto_approved`.
- `GET /api/corrections?mine=1&month=2026-10`
- `POST /api/corrections/:id/cancel` (pending only)
- `POST /api/corrections/:id/undo` (own `auto_approved` row, month still open)

Admin
- `GET /api/admin/corrections?status=pending&office=...` (oldest first, includes `effect` and phone sync times for that day, never coordinates)
- `POST /api/admin/corrections/:id/approve` body `{ applied? }`
- `POST /api/admin/corrections/:id/reject` body `{ note }` (note required)
- `GET /api/admin/corrections/count?status=pending` for the rail badge

Rules
- Add `correction_window_days` (default 5) to the rules endpoint. Phones read it; only admins write it.
- `correction_approval`: `auto` (default) or `admin`. Stored as `correctionRequiresApproval` (false means auto). Same setting for Month and Today.
- `correction_auto_approve_limit` (default 4): auto approve up to N per person per office-timezone month. Later reverts still count. The next one is `pending` with reason "Over N this month."
- `correction_require_sync` (default true): if the day has no phone samples, outcome is `pending` with reason "No phone data that day."
- `correction_daily_digest` (default true): one Teams message to admins at 9:00 Asia/Kolkata.
- Admins never get `auto_approved` on their own data. Outcome is `pending` with reason "Admins cannot auto approve their own corrections." `reviewedById` must not equal `userId`. Auto approved rows leave `reviewedById` null.
- Any `in_at` or `out_at` later than now is rejected with 400 and no row is written. Still In (`out_at` null) is allowed.
- The employee can undo their own `auto_approved` row until the month locks. An admin reverts with a required note. Status becomes `reverted`, the original data returns, and the person is notified.

Notifications
- Push to the requester's devices on approve and reject, using the existing notification path.

# Users and view-as: proposed backend additions

Users
- `GET /api/admin/users?q=&role=&office=&status=&includeTest=`
- `POST /api/admin/users` `{ name, email, role, home_office_id, is_test }` (409 if the email exists, return the existing id)
- `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/deactivate`, `POST /api/admin/users/:id/reactivate`
- `DELETE /api/admin/users/:id` body `{ confirm_email }`
- Add `is_test boolean default false` and `status` (`active`, `deactivated`) to users. Visits get `is_test` copied from the user at write time; reports and roster filter `is_test = false`.

View as
- `POST /api/admin/view-as` `{ user_id }` returns `{ token, mode: "read_only" | "test", expires_at }`. Reject if the target is an admin or deactivated.
- A read_only token rejects every write endpoint (sync, corrections, sharing, devices) with 403.
- `POST /api/admin/view-as/end`. Table `view_as_sessions(admin_id, user_id, mode, started_at, ended_at)`.

# Profile and notifications: proposed backend additions

- Users get `first_name`, `last_name`, `preferred_name` (nullable), `display_format` (`first_last`, `preferred_last`, `preferred`). Colleague and roster responses return a computed `display_name`.
- `GET/PATCH /api/me/profile`. Email is not writable here.
- `GET/PATCH /api/me/notifications` `{ arrivals, goal_met, weekly_summary, corrections, tracking_problems, quiet_hours: { enabled, start, end } }`. The server checks these before sending push; tones and vibration stay on the device.
- View as on web uses the same `POST /api/admin/view-as` token, stored in a separate httpOnly cookie and cleared on End.

# Several offices and office editing

- Day detail response: `{ day, counts_as, total_minutes, travel_minutes, offices: [{ office_id, name, minutes, visits: [{ in_at, out_at, minutes, device }] }] }`, offices ordered by first arrival.
- `PATCH /api/admin/offices/:id` accepts `name` (unique), `address`, `radius_m`, `counts_as`, `lat`, `lng`. Responses include `lat` and `lng` for admins only; employee and colleague endpoints never return them.

# Admin direct edits

- `PUT /api/admin/people/:userId/days/:date` body `{ visits: [{ id?, office_id, in_at, out_at }], counted: boolean, reason, notify }`. Replaces the day's visits in one transaction, recalculates days, closes any pending correction for that day as `resolved_by_admin`. 403 if `userId` is the caller.
- `POST /api/admin/people/:userId/visits` for a day with no visits (same body shape, single visit).
- `GET /api/admin/people/:userId/history?month=` returns `[{ actor, at, day, action, before, after, reason }]`. Append only.
- `PATCH /api/admin/users/:id` accepts profile fields, email, role, home_office_id, is_test, sharing. Email change revokes all device sessions.
