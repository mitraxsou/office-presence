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

## Tests

```powershell
npm run test:all
```
