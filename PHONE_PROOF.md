# Phone proof checklist

App: com.pwc.officepresence (Material 3 UI, light theme default)
Backend: https://office-presence-psi.vercel.app

## UX on the phone

1. Light theme is the default. Open Settings (toolbar) and toggle Dark mode anytime.
2. Settings shows global policy (gap, day hours, month days, timezone, fence radius, sample interval). Read-only from server.
3. Test mode switch: 15 second visit gap + 15 second samples (for soak testing). Admin/web policy stays 15 minutes for production.
4. Set office here asks for a name (example: Bangalore office). Name is stored on the phone and server.
5. Home shows In / Out chip, office name, hours, check-in / check-out with snackbar confirmation. Check-out uploads immediately and sets web /admin status to Out.

## Automated presence

- Inside the named office geofence: samples / enter show In.
- Outside the radius: exit / samples show Out.
- Manual check-in / check-out is the fallback when geofence fails.

## Mock location (debug / soak)

Play Services fused location accepts mock GPS when Developer options has a mock location app selected. Debug APK is debuggable so OEM mock apps can inject into this process. No special ACCESS_MOCK_LOCATION permission is required on modern Android.

1. Enable Developer options on the phone.
2. Developer options -> Select mock location app -> pick your mock GPS app (Fake GPS, Lockito, etc.).
3. In Office Presence: grant location, turn on Test mode (15s gap).
4. In the mock app, set coordinates at the office. In Office Presence: Set office here, name it, confirm In.
5. Jump the mock pin outside the fence radius. Within one sample / geofence exit, app and https://office-presence-psi.vercel.app should show Out.
6. Jump back inside: should show In.

## Real office (test mode OFF)

1. Sign in with PwC email. Teams code should arrive.
2. Grant location (while in use, then all the time), notifications, battery exemption.
3. Stand in the office: Set office here with a name. Confirm In.
4. Lobby / street / home: should show Out.
5. Screen off for a long stretch inside: visit stays open, notification remains.
6. Real exit: visit closes; hours on phone and web match.

Until those location checks pass, hours are not trusted.
