# Office Presence

Android phone app + portable Next.js backend for office hours tracking.

## Layout

- `android/` - Kotlin app (`com.pwc.officepresence`)
- `web/` - Next.js API and admin dashboard
- `shared/visit-cases.json` - shared visit math cases

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
2. **GitHub Release** - attach the signed `app-release.apk` (e.g. tag `v2.0.1-pilot`). Notes: `docs/release-notes-v2.0.1-pilot.md`.
3. **Public page** - `/download` on the pilot web app. Set `NEXT_PUBLIC_ANDROID_APK_URL` on Vercel to the GitHub Release asset URL and redeploy.

## Tests

```powershell
npm run test:all
```
