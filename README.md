# Office Presence

Android phone app + portable Next.js backend for office hours tracking.

## Layout

- `android/` - Kotlin app (`com.pwc.officepresence`)
- `web/` - Next.js API and admin dashboard
- `shared/visit-cases.json` - shared visit math cases
- `docs/OFFICE_PRESENCE_LIVING_DOC.md` - living product and KT document (product rules, user, admin and developer guides, gaps). The Android app is documented there too.

## Android debug builds use staging

Debug builds install as `com.pwc.officepresence.staging` and need `STAGING_API_BASE_URL` in `android/local.properties` (or `-PSTAGING_API_BASE_URL=...`). The build fails without it so debug never writes to production. See the living doc, section D12.

## Web local

```powershell
cd web
copy .env.example .env.local
npm install
npx prisma db push
npm run dev
```

Sign-in codes arrive in Microsoft Teams via Power Automate (no email OTP).

## Pilot Android APK

Three distribution paths (all kept):

1. **Firebase App Distribution** - Console upload or `npm run distribute:android` (see `docs/design/FIREBASE.md`).
2. **GitHub Release** - attach the signed `app-release.apk` (e.g. tag `v2.0.6-pilot`). Notes: `docs/releases/2.0.6.md`.
3. **Public page** - `/download` on the pilot web app. Set `NEXT_PUBLIC_ANDROID_APK_URL` on Vercel to the GitHub Release asset URL and redeploy.

## Tests

```powershell
npm run test:all
```
