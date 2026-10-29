# Office Presence 2.0.1 (pilot)

Signed release APK for the PwC pilot.

## Install

1. Download `app-release.apk` from this release (or open `/download` on the pilot web app once `NEXT_PUBLIC_ANDROID_APK_URL` points here).
2. On Android, allow installs from your browser (Install unknown apps).
3. Uninstall any debug build first if the signing key differs.
4. Install, sign in with your PwC email, and allow location.

## Other channels

- Firebase App Distribution / App Tester: ask a pilot admin for a `pilot` group invite (same APK).
- Public page: `https://office-presence-psi.vercel.app/download`

## Env for the web download button

Set on Vercel (Production), then redeploy:

```
NEXT_PUBLIC_ANDROID_APK_URL=https://github.com/mitraxsou/office-presence/releases/download/v2.0.1-pilot/app-release.apk
```

(Use the exact browser asset URL shown on the release page after upload.)

Note: this repo is private, so that URL requires GitHub access. For anonymous phone installs, use Firebase App Tester or set `NEXT_PUBLIC_ANDROID_APK_URL` to a public APK URL.
