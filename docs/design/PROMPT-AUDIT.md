# Cursor prompts: find the gaps, then fix them

Use these when the app already exists and you want Cursor to find what differs from the design.
Run Prompt 1 first. Review GAPS.md. Then run Prompt 2 once per batch.

## Prompt 1: audit (no code changes)

```
You are auditing this repo against the Office Presence design. Do not change any code in this step.

Sources of truth, in this order:
1. docs/design/SPEC.md (all sections, including 9 to 16)
2. docs/design/frames/*.png (frame name is in the file name, for example 07_P-Today-In.png)
3. docs/design/corrections-api.md (backend additions)
4. .cursor/rules/*.mdc

Steps:
1. List every frame in docs/design/frames. For each, find the screen that implements it:
   Android Compose screen or composable, Next.js route or component, or "missing".
2. For each implemented screen, open the frame PNG and the code, and compare:
   layout and order, copy (exact strings), components used, colors and tokens, states (loading, empty, error),
   light and dark, mobile web layout under 720 px, and behavior described in the frame note in SPEC.
3. Check these known defects seen on real devices and mark each as present or fixed:
   - Phone top bar shows "Updated N min ago" next to the wordmark and wraps. It must live under the status line.
   - Greeting and names show the email local part (for example "soumitra.m.mandal"). Use preferred name, then first name,
     then the email part before the first dot, capitalised.
   - Status word renders "In." with a period. It must be exactly "In" or "Out" plus the dot.
   - "For X, since Y" line missing under the office name on Today.
   - Check now is a filled orange button. It must be OpSecondaryButton, in a row with the colleagues text.
   - Screen looks tinted pink: dynamic color or surfaceTint not disabled.
   - Web count strip wraps into 2 by 2 on desktop with full-width underlines. Desktop is one row; only the active cell is underlined.
   - "Include test accounts" checkbox is oversized and its label wraps.
   - Admin shown twice (tag next to name and Role column).
   - Home office shows "-" instead of "Not set".
   - Rail group labels in capitals ("YOU", "ADMIN"). Use sentence case "Admin", and no "You" label.
   - Any UI string containing "points", "checked in", an em dash or an en dash.
4. Check the backend for every endpoint and field in corrections-api.md: exists, partial, or missing.
5. Check accessibility basics: touch targets 44 px, text inputs 16 px, status never shown by color alone,
   font scale 1.3 and 1.5 on Android without overlapping text.

Write docs/design/GAPS.md with:
- A table: Frame | Platform | File(s) | Status (done, partial, missing) | What differs (one line)
- A "Known defects" checklist from step 3
- A "Backend" table from step 4
- A proposed order of batches, smallest safe changes first:
  Batch A: tokens, theme, strings, known defects
  Batch B: shared components (DaysMeter, StatusBadge, HoursFyi, buttons, bottom bar, rail)
  Batch C: phone screens
  Batch D: web desktop screens
  Batch E: mobile web (responsive) layouts
  Batch F: backend additions, then the screens that depend on them (corrections, admin edits, users, view as,
           profile, notifications, several offices per day, office rename)
Each batch item names the frame, the files, and a one-line acceptance check.

Stop after writing GAPS.md and summarise the top 10 gaps.
```

## Prompt 2: fix one batch

```
Read docs/design/GAPS.md and work on Batch <A, B, C, D, E or F> only.

Rules:
- Follow .cursor/rules and docs/design/SPEC.md. Open the matching frame PNG before editing each screen.
- UI changes only, unless the batch is F. Do not rename existing API fields or database columns.
- Reuse existing ViewModels, data fetching and components. Do not add libraries (no Tailwind, no UI kits).
- Keep each change small. After each item: build, run lint and tests, and fix anything you broke.
- Android: add or update @Preview in light and dark, and check font scale 1.3.
- Web: check 1440, 1024 and 390 px widths, light and dark.
- No em or en dash in any string. Say "days", never "points".

When the batch is done:
- Tick the items in GAPS.md and add a one-line note per item of what changed and where.
- List anything you could not finish and why.
- Do not start the next batch.
```

## Prompt 3: final check

```
Compare every frame in docs/design/frames with the running apps (Android and web at 1440 and 390 px, light and dark).
Update docs/design/GAPS.md so every row is done or has a clear reason. Search the codebase for "points", "checked in",
the characters U+2013 and U+2014 in UI strings, hardcoded hex colors in screens, and fix any hits.
```
