# Prompts for Cursor, in order

One prompt per branch. Review the diff, run the app in light and dark, compare with the frame, then merge.
Attach frames with `@` (for example `@docs/design/frames/07_P-Today-In.png`).

## 0. Map the existing apps (no code changes)
```
Read docs/design/SPEC.md and the rules in .cursor/rules.
Write docs/design/MAPPING.md with:
- for each frame name in SPEC section 4: the existing Compose screen, XML screen (to rebuild), or Next.js route that implements it, or "new"
- the current contents of ui/theme/Color.kt, ui/theme/Theme.kt, app/tokens.css and app/globals.css, and which names are used where
- every UI string containing "points" (strings.xml and .tsx)
- the Android toolbar overflow menu and every destination it opens
- the remaining XML screens and what replaces each one
Do not change code.
```

## 1A. Android theme merge
```
Merge docs/design/android/theme/Color.kt and Theme.kt into com.pwc.officepresence.ui.theme.
Keep existing public names compiling by pointing them at the new values. Make sure dynamic color is off.
Replace res/values/colors.xml and values-night/colors.xml with the versions in docs/design/android/res, and
update the splash theme and notification setColor to use op_splash_bg and op_accent. Remove colors no longer referenced.
No screen changes yet. Build must pass.
```

## 1B. Web tokens merge
```
Merge docs/design/web/tokens.css into app/tokens.css. Alias existing variables to the new --op-* ones instead of deleting them.
Update app/layout.tsx to set the theme class from the op-theme cookie, using docs/design/web/app/layout.example.tsx.
Add the setTheme server action from theme-action.example.ts. No page changes yet.
```

## 2. Words: points to days
```
Using MAPPING.md, change UI strings from points to days per SPEC section 1, in strings.xml and .tsx files.
Add formatters: Android ui/format/Days.kt, web lib/days.ts (formatDays, countsAs, toGo).
Do not rename API fields. Remove any em or en dash from UI strings.
```

## 3A. Android shared components
```
Add docs/design/android/components/OpComponents.kt to ui/components, adjusted to compile.
Add @Preview for each component in light and dark. Match docs/design/frames/01_Foundations.png.
```

## 3B. Web shared components
```
Add DaysMeter, StatusBadge, HoursFyi from docs/design/web/components into components/, as Server Components with CSS Modules.
Add a /dev/components page (dev only) that shows each in light and dark, matching 01_Foundations.png.
```

## 4. Android navigation
```
Replace the toolbar overflow menu with OpBottomBar in a Scaffold: Today, Month, Colleagues, You (SPEC section 2).
Use Navigation Compose. Move Settings and Devices under You, add Admin console (admins only, opens the web roster),
keep Developer reachable only by tapping Version 7 times. Handle edge to edge insets.
Every destination the old menu opened must still be reachable. Match frames 07, 12, 24, 28.
```

## 5. Android screens (one per prompt)
```
Rebuild Today in Compose to match 07_P-Today-In, 09_P-Today-Out, 10_P-Today-Permissions-needed, 11_P-Today-Loading.
Use StatusHero, DaysMeter, HoursFyiRow. Read from the existing ViewModel only. If this screen is XML today, delete the layout after.
```
Then: Month (12 to 15), Colleagues (24 to 27), You and Devices (28, 29), Login (03 to 06).

## 6. Web shell and pages (one per prompt)
```
Add the left rail layout in app/(app)/layout.tsx and the / redirect (SPEC section 2). Then rebuild /month to match 33 and 34,
with the day drawer as ?day= URL state. Reuse current data fetching.
```
Then: Colleagues (36), Settings (37), Roster with loading, empty, error (38 to 42), Offices (47), Reports (48), Rules (49), Person visits (50).

## 7. Corrections (after the backend owner approves docs/design/corrections-api.md)
```
Implement the correction request API per corrections-api.md with tests: one pending per day, locked month,
admin cannot decide own request, reject requires a note, approve keeps the original visit.
```
```
Android: build the correction flow (frames 15 to 23) and You > Correction requests.
```
```
Web: build W / Month / Request a correction (35) and the admin Corrections queue and review drawer (43 to 46)
as ?request= URL state with Server Actions. Add the Corrections rail item with the pending count.
```

## 8. Final check
```
Compare every frame with the running apps in light and dark and list differences in docs/design/QA.md.
Search strings.xml, .kt and .tsx for em and en dashes and fix any.
```
