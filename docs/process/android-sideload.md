# 怎么去 Android — sideload install (owner) and first device test (Director + owner)

The APK is signed with the owner's release key (cert SHA-256 in `src/android/release-cert.sha256`). It is not on
Google Play, so Android treats it as an app "from unknown sources". Every later version is signed with the same key
and installs **over** the old one, keeping places and contacts.

Build output: `D:\howtogo-builds\<version>\howtogo-<version>.apk` + `.apk.sha256` (also `dist-android\` in the
worktree). Requirements: Android 7.0 (API 24) or newer; best on Android 10+.

---

## Part 1 — Owner: install on your phone

### 1. Get the APK onto the phone (pick one)
- **USB cable (simplest):** plug the phone into the PC, pull down the notification "Charging this device via USB" →
  choose **File transfer**. In Windows Explorer open the phone → `Internal storage\Download` and copy
  `howtogo-1.1.0.apk` there. Unplug.
- **Later, download:** once the `/android` page exists (M6 AC 38–39), open it in Chrome and tap Download. Not
  available yet; do not upload the APK to other file-sharing sites.

### 2. Check the file (optional, recommended)
The SHA-256 of the file must equal the value in `howtogo-1.1.0.apk.sha256`. On the PC:
`certutil -hashfile D:\howtogo-builds\1.1.0\howtogo-1.1.0.apk SHA256`. (The `/android` page will show it too.)

### 3. Allow installs from your Files app (once)
1. Open the **Files** app (Samsung: **My Files**; Pixel: **Files by Google**) → Downloads → tap `howtogo-1.1.0.apk`.
2. Android says "For your security, your phone is not allowed to install unknown apps from this source" → tap
   **Settings** → turn on **Allow from this source** → press Back.
   (If you download with Chrome instead, the same switch appears for Chrome.)
3. You can turn the switch off again after installing; you will need it again for each update.

### 4. Install
Tap **Install**. If **Google Play Protect** shows "Unsafe app blocked" / "App scan recommended":
- This is normal for any app that is not from the Play Store; Play Protect has simply never seen this app.
- Tap **More details → Install anyway** (or **Scan app**, then **Install** — the scan is fine to run).
- Do **not** turn Play Protect off.

Tap **Open**. The app is called **怎么去**.

### 5. First run
- Location: choose **While using the app** (the app never asks for "Allow all the time").
- Notifications: **Allow** when you start your first trip (needed for the lock-screen "下车" alerts).
- Battery: follow the in-app battery guide for your phone brand when it appears.

### 6. Updating later
- Copy or download the new `howtogo-<version>.apk` and tap it → **Update**. Same steps as above.
- **Never uninstall to update** — uninstalling deletes your saved places and contacts. If Android ever says
  "App not installed as package conflicts with an existing package", stop and tell the Director (it would mean a
  wrong signing key); do not uninstall.

---

## Part 2 — First device test (Director runs it with the owner)

Device rules (requirements M6 §L): personal profile only; the owner unlocks and taps when asked; check the app is in
the foreground before any tap; no reboot; no global settings beyond the app's own permissions, notification channels
and battery setting; install **in place**; leave the phone on Home. Record phone model, Android version, battery %,
APK SHA-256. Results: pass / fail + S1–S4 in `qa/reports/1.1.0-android.md`.

"adb" = can be scripted over USB debugging for the later scripted kit (needs the owner to enable Developer options
→ USB debugging and to accept the PC's key; not used in this round). "manual" = a person must look/tap/listen.

| # | Check | M6 AC | How | adb-scriptable? |
|---|---|---|---|---|
| 1 | Install: SHA-256 matches; Play Protect flow as in Part 1; app opens to Home with label 怎么去 and the logo icon (themed icon on Android 13+) | 2, 38 | manual | partly: `adb install -r`, `pm list packages`, `dumpsys package com.wwweeeiii.howtogo \| grep versionName` |
| 2 | Signature/version on device: versionName 1.1.0, versionCode 1010000 | 33, 34 | manual (Settings → Apps → 怎么去 → App details) | yes: `dumpsys package` |
| 3 | Location permission: explainer first, then system dialog; only "While using the app" / "Only this time" offered — no "all the time" | 7, 26, 28 | manual | partly: `dumpsys package … \| grep permission` for the result; `pm grant/revoke` to reset |
| 4 | Notification permission (Android 13+): asked at Start with an explainer; denied → in-app note | 27 | manual | partly: `pm revoke … android.permission.POST_NOTIFICATIONS` to retest |
| 5 | Notification channels: Settings → Apps → 怎么去 → Notifications shows **trip** (low), **alerts** (high, lock screen public), **info** — zh names when the phone is Chinese | 21 | manual | yes: `dumpsys notification \| grep -A3 com.wwweeeiii.howtogo` (channel ids, importance) |
| 6 | Guided trip in **demo mode** (replay): Start → "行程进行中" ongoing notification shows the current step; steps advance; voice speaks each step | 8, 11, 12, 16 | manual (watch + listen) | partly: launch `am start -n com.wwweeeiii.howtogo/.MainActivity`, logcat tag `howtogo` hook lines (`trip:service-start`, `loc:native-profile`) |
| 7 | **Lock-screen alert:** during the demo trip lock the phone; "下一站下车" then "现在下车" appear on the lock screen with voice + the get-off vibration (3 buzzes); "知道了 / OK" acknowledges; one re-buzz after ~20 s if not acknowledged | 9, 15, 17, 18, 21, 22, 42 | manual (look, listen, feel) | partly: `input keyevent 26` (screen off), logcat `alert:armed` / `alert:native-*`; seeing/feeling needs a person |
| 8 | Stop from the notification opens the app on "要结束这次行程吗？"; **Keep going** continues, **End** stops the service and removes the notification | 13 | manual | partly: logcat `trip:stop-requested`, `trip:service-stop`; `dumpsys activity services com.wwweeeiii.howtogo` |
| 9 | **Back:** from route detail / settings / sheets Back goes one level up; from Home Back leaves the app (Android 14/15: back-to-home preview); no exit in the middle of a trip without the confirm sheet | 24, 25 | manual for the predictive animation | yes: `input keyevent 4` per screen + `dumpsys activity activities \| grep mResumedActivity` |
| 10 | **TTS zh voice:** a Chinese voice speaks the step text; if none is installed the "no Chinese voice" sheet offers the TTS data installer | 8 | manual (listen) | partly: `settings get secure tts_default_synth`, logcat hook; hearing needs a person |
| 11 | DND on → run the demo alert: note whether the alert sounds/vibrates (alerts channel can override DND only if the owner allows it) | 23 | manual | partly: `cmd notification set_dnd on/off` (global setting — only with the owner's OK) |
| 12 | Battery guide for the brand appears; status ✔ after following it | 29, 30 | manual | partly: `dumpsys deviceidle whitelist \| grep howtogo` |
| 13 | Live data: search + route detail with map tiles render (needs the production Worker deployed with `https://localhost` in `ALLOWED_ORIGINS`) | 4 | manual | partly: screenshots `screencap`, logcat for HTTP errors |
| 14 | No coordinates/places/tokens in logcat during the run | 37 | — | yes: `logcat -d \| grep -E '1\.[23][0-9]{3},\s*10[34]\.'` etc. |
| 15 | Leave: phone on Home; the app stays installed (owner's real app). Any `.qa` build installed for testing is uninstalled | rules | manual | yes: `input keyevent 3`, `pm uninstall com.wwweeeiii.howtogo.qa` |

Later (not in the first session): the locked-screen real bus ride (AC 42), the 1 h battery run ≤ 8 %/h (AC 43) and
update-in-place with the next version (step 11 of the §L script).
