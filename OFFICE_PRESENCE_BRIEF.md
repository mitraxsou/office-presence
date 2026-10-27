# Office presence on Android

Product brief for this Android project. It is not an implementation plan for the Office Tracker (laptop) repo.

## Objective

Build a phone app that answers one question over a workday: was this person in the office long enough?

The bar used by the existing laptop product (PwC Office Pulse):

- A day counts when in-office time reaches **5 hours**.
- The monthly target is **8 office days** (configurable on the laptop product; keep the same defaults unless this project chooses otherwise).
- Clock and day boundaries use **Asia/Kolkata** unless the person sets another timezone.
- Presence is a stretch of time, not a single ping. Samples (or enter/exit events) open a visit, keep it open while the person stays, and close it when they leave.
- On the laptop, a gap longer than **15 minutes** ends the visit. A heartbeat is sent about every **5 minutes** (allowed range 2-60). Treat those as the current product rules. Change them only if the Android signal cannot support a 5-minute sample (for example a geofence that fires on enter and exit instead of a poll).
- If the signal is missing, unknown, or too weak, that time does not count as in office.
- When automatic detection fails, the person can check in and check out manually.

## What the laptop does today (context only)

The Windows agent does not use GPS. It reads the connected Wi-Fi name and counts the person as in office only when that name is on an allowlist: `OfficeConnect`, `ExternalConnect`, or `pwcglb.com`.

These do not prove office presence, and the Android app must not use them as proof either:

- GlobalProtect / VPN (it is on at home and in the office)
- Public IP
- VPN gateway name

The laptop identifies a device with a user token plus the BIOS serial, and posts that to the existing web app. That mechanism is specific to Windows. Do not copy it unless this Android app is deliberately integrating with that same backend.

## What is undecided on purpose

How the phone decides "in office" is not chosen yet. Pick the best signal after looking at:

- Android version on the test phone
- Whether the phone is personally owned or managed by company MDM (MDM often blocks sideloading, USB debugging, background location, or Wi-Fi scans)
- Whether this app has its own backend, or will later post into Office Pulse
- A real test inside the office and just outside it, not a lab guess
- Battery over a full workday with the screen off
- Whether the OEM (Samsung, Xiaomi, Oppo, Vivo, and others) kills background work unless the user turns off battery optimization

Do not start by assuming GPS is the answer only because the phone has a GPS chip. Do not start by porting the Windows Wi-Fi check only because the laptop uses it.

## Signals to compare

Score each option on accuracy at the real office, false "in office" readings nearby, screen-off behavior, battery, permissions the person will actually grant, and whether MDM allows it.

### Wi-Fi name or BSSID match

Closest to the laptop rule. On Android it is constrained: location permission is required to read the connected network; from Android 10 the name is often `<unknown ssid>` unless location services are on; Android 12/13 adds nearby-Wi-Fi permission. Enterprise Wi-Fi can hide the name or randomize the MAC. Use this if a test on the real phone returns a stable office network id.

### Fused location and a geofence

Use the fused provider (GPS plus Wi-Fi plus cell), not the raw GPS chip alone. Indoor error is often tens of meters and sometimes worse, so the fence needs a center and radius measured at the office, then checked from the lobby, the street, and home. Polling every 5 minutes all day is costly. The platform geofence (enter and exit) is usually the better shape. Reliable all-day tracking needs "Allow all the time" location plus a foreground service and a persistent notification. A browser page or Expo Go cannot hold this in the background. Play Store policy requires a prominent disclosure if the app is published.

### Hybrid

Geofence (or a coarse location) wakes the app, then a second signal confirms office (Wi-Fi name or BSSID if the phone can see it). This is the right candidate when either signal alone is flaky indoors.

### Manual check-in

Always keep it. It is the fallback when permissions, MDM, or the building defeat automatic detection.

### Reject these as the office test

VPN connected, public IP, "network available", and cell tower alone (too coarse for one building).

## Architecture decisions to make in that project

Decide these before locking the signal:

- **Where the visit is calculated.** Prefer the server (or a single module) turning samples into visits. The phone should report evidence (location fix, Wi-Fi id, or geofence transition) and the time. The phone should not be the only place that decides hours, if a backend exists.
- **Sample vs event.** A 5-minute poll matches the laptop. A geofence enter/exit model can match the same 5-hour outcome with fewer wakes. Pick one and define when a visit ends.
- **Identity.** A laptop serial does not exist. Use a stable app install id. Do not invent a fake office Wi-Fi name to fit an old API.
- **Double counting.** If the same person also runs the laptop agent, two devices in the office must not add two sets of hours for one visit. Define the rule (one active device, merge overlapping visits, or phone-only pilot with the laptop ignored).
- **Weak fixes.** A GPS point with poor accuracy (for example worse than the fence radius) must not flip the person to in office.
- **First milestone.** On one phone, prove the chosen signal: in the office reads in office, outside reads out, screen off for a long stretch still closes the visit after a real exit. Only after that, persist hours.

## If this app later talks to Office Pulse

The current heartbeat API treats office presence as an allowlisted Wi-Fi name (source defaults to `wifi`). A GPS or other phone signal needs its own source and its own office definition (coordinates and radius, or a network id). Do not send a fake SSID. Do not point a local dev machine at the production database to try this. Soak on one phone before any wider install.

## Out of scope for the first version

- Replacing the Windows laptop agent
- Fleet install, Play Store release, or MDM packaging
- Counting commute time, or time merely "near" the city
- Using VPN or IP as an office check
