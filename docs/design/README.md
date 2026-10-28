# Office Presence redesign handoff

1. Copy `.cursor/` and `docs/design/` into the repo root (both the Android and web repos if they are separate).
2. Commit on a branch such as `design/handoff`, open the repo in Cursor.
3. Rules in `.cursor/rules/` load automatically: core always, Android rules for `.kt` and `res` files, web rules for `.tsx`, `.ts`, `.css`.
4. New build: work through `PROMPTS.md`. Existing build: start with `PROMPT-AUDIT.md` to find and fix gaps.

Contents
- SPEC.md: vocabulary (points), navigation, components, screens and states, corrections flow
- frames/: 50 PNGs named like the design file; prototype.html to click through them
- android/theme/: Color.kt, Theme.kt to merge into com.pwc.officepresence.ui.theme (Material 3, dynamic color off)
- android/components/OpComponents.kt: StatusHero, DaysMeter, HoursFyiRow, StatusBadge, buttons, OpBottomBar
- android/res/: colors.xml for splash and notifications only
- web/tokens.css: --op-* variables, light and dark
- web/components/: DaysMeter, StatusBadge, HoursFyi as Server Components with CSS Modules
- web/app/: layout and theme cookie examples for Next.js 15
- corrections-api.md: the one backend addition, for the backend owner to approve
