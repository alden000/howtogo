# M6 — Android app (Capacitor) (draft)

PM · 2026-11-17 · Estimate: **7–9 h if run straight through** (ROADMAP said 6–8 h; the spike removed ~1 h of risk, signing, the download page and the permission/OEM screens add ~2 h; see "Estimate" at the end). Excludes owner waits: the appId and keystore decisions, signing on the owner's computer, the real-device sessions (≈ 30 min setup + one locked-screen bus trip + a 1 h battery run).

## Goal
With the **Android app** (sideloaded APK, D-6), guidance keeps working **with the screen off or the phone locked, in a pocket or bag**: GPS keeps arriving, the voice still says "下一站下车", the phone buzzes and lights the lock screen at the right stop, and family keeps seeing her move. Everything else is the same app as the web 1.0 (same build, same screens), and installing and updating it is something the owner can walk a senior through.

## Non-goals (Later / other milestones)
- Google Play or any store (D-6: sideload only). No closed-test track.
- iOS app (ROADMAP Later).
- Starting a trip from the background, geofenced reminders, "always on" location. **No `ACCESS_BACKGROUND_LOCATION`** (spike: a location FGS started from the visible app keeps while-in-use access with the screen off).
- Full-screen intents (`USE_FULL_SCREEN_INTENT` restricted on Android 14+), exact alarms, boot receivers, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (process §7), `REQUEST_INSTALL_PACKAGES` (no in-app installer).
- Native rewrites of screens. All UI stays in the WebView; only the `platform` adapter and the trip service are native.
- Analytics or crash SDKs (Firebase etc.). Monitoring is the M5 error counts only.

## Starting point (spike, `dev/m6-spike`, director-log "M6 spike result")
| Built in the spike | M6 does |
|---|---|
| Capacitor **8.6.2** shell in `src/android`, `sg.howtogo.app` placeholder, minSdk 24 / target 36, debug APK 5.1 MB, lint 0 errors | Production shell with the real app, release build, signing, R8, version scheme |
| Custom **TripPlugin / TripService** (~330 lines): `foregroundServiceType="location"`, `exported=false`, `start / setInterval / updateNotification / stop`, ongoing "行程进行中 / Trip in progress" + 结束 / Stop, fused location (play-services-location 21.3.0), `START_NOT_STICKY`, `armAlert` native get-off backup (alerts channel, vibration, TTS) | Wire into the trip runtime; per-leg intervals and priority; LocationManager fallback; dedupe with JS alerts; Stop semantics |
| `@capacitor-community/text-to-speech`, `@capacitor/local-notifications` (`getoff` channel), `@capacitor/app` | Native speech + notify in the adapter; zh voice check |
| Back pattern: `backButton` → `history.back()`, `toggleBackButtonHandler({enabled: depth > 0})`, `enableOnBackInvokedCallback=true` | Ship it (spike found Capacitor never exits at root otherwise) |
| Adapter sketch `src/android/adapter/capacitor-platform.ts` (tsc-clean vs `platform/types.ts`) | Move to `src/web/src/platform/native.ts`, select at runtime |
| Rule: **drive guidance from `fix` events, not JS timers** (hidden WebView throttles `setTimeout`) | Enforce in code and gate |
| Unverified: screen-off fixes, OEM killers, zh voice while locked, lock-screen heads-up, predictive back, real app in WebView (SW, WebGL, CORS), battery | Real-device script (§L) |

## Lessons carried in
- **System Back follows the in-app page stack** (process §7, AutoStream lesson): sheets close first, the root leaves the app, predictive back on.
- **Release-build smoke on a real runtime** (process §4; Copycat: R8 broke reflection twice): the R8 release APK is installed and exercised, not the debug one.
- **The signing key and appId are permanent** for sideload updates: a lost key means every user uninstalls (and loses her places and contacts). The keystore never enters the repo or this environment unless the owner says so.
- **Safety beats battery and rate limits** (D-7): the native backup alert fires even if the WebView is asleep; low-battery mode never delays a get-off alert (M5 AC 9).
- **Never fake data / no identifiers in logs:** release logcat carries no coordinates, place names, ids or tokens.
- **Device rules** (process §5) bind every real-device step: personal profile only, foreground check before input, no unlock/reboot/global settings, installs in place, test build as a separate package.

---

## Acceptance criteria

### A. Shell and build
| # | Pri | AC |
|---|---|---|
| 1 | Must | `src/android` (Capacitor 8.6.2) wraps **the same release web build** as the web 1.0 (`npm run build:release`), bundled in the APK (`https://localhost`), with the spike harness **excluded** from release builds. One command from the repo root: `npm run android:release` (build web → `cap sync` → Gradle `assembleRelease`, `--no-daemon --max-workers=2`, host contention rule D-9) |
| 2 | Must | **appId** = the owner's choice (OQ1, placeholder `sg.howtogo.app`), set once in `capacitor.config.ts` and `build.gradle`; a gate check fails if it differs between them. Label "怎么去", adaptive icon from logo B (foreground, background, **monochrome** for themed icons), splash = paper background + logo, no Capacitor default assets left (lint "template icon" warnings gone) |
| 3 | Must | minSdk 24, targetSdk/compileSdk 36; **16 KB page size** compatible (all `.so` files, if any, 16 KB aligned — checked with `zipalign -c -P 16 -v 4`); release APK ≤ 12 MB |
| 4 | Must | The service worker is **not** registered inside the app (assets are local; updates come with a new APK). The API origin is the production Worker (`https://<prod host>/api`, M5 AC 32 adds `https://localhost` to `ALLOWED_ORIGINS`); MapLibre/WebGL and OneMap tiles render in the WebView. If the Android System WebView is older than Chrome 100, a full screen says "请更新 Android System WebView" with a button to its store page |
| 5 | Must | The web build stays web-only: `@capacitor/*` code is in a lazy chunk loaded only when `Capacitor.isNativePlatform()`; the web entry chunk grows ≤ 2 KB gz (M5 AC 3 budget still holds) |

### B. Native platform adapter
| # | Pri | AC |
|---|---|---|
| 6 | Must | `src/web/src/platform/native.ts` implements the D-4 `Platform` interface (location, heading, speech, wake lock, vibrate, notify, battery, share) on Capacitor and is chosen at start-up when native; `capabilities` = `{native: true, backgroundGuidance: true}` so the UI hides "keep the screen on" advice, the wake-lock note and the install helper (M5 AC 29). The M2 gate grep (no `navigator.geolocation`, `speechSynthesis`, … outside `platform/`) also covers `native.ts` imports |
| 7 | Must | `location.watch` starts the **TripService** only for a guided trip (Start tap with the app visible); `location.current` and search-time location use a one-shot fused request with no service. A unit test on the adapter (Capacitor plugins mocked) checks both paths |
| 8 | Must | **Native TTS:** `speech.speak` uses Android `TextToSpeech` with `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` audio attributes, ducks other audio, and works with the screen locked. `speech.voices()` reports `zh`/`en` from `isLanguageAvailable`; if zh-CN is missing, the first trip shows "这部手机没有中文语音" with a button that opens the TTS data installer (`ACTION_INSTALL_TTS_DATA`) and the app falls back to English voice + vibration (never silence without telling her) |
| 9 | Must | **Vibration** uses the STYLE-GUIDE 6c.13 haptic names mapped to native patterns (`get_off` = three long), and works with the screen off; `notify` maps to §E channels |
| 10 | Should | `heading` uses the rotation-vector sensor while the screen is on and is stopped while it is off |

### C. Trip foreground service
| # | Pri | AC |
|---|---|---|
| 11 | Must | Start trip → TripService runs as a **`location` FGS** with the ongoing low-importance notification "行程进行中 · {current step short text}" (updated on each step change, no coordinates) and actions; it stops on End, arrival + 60 s, the notification's Stop path (AC 13), or process death (`START_NOT_STICKY`; on next launch the stored trip resumes via M2 AC 46 and the service restarts only after a tap) |
| 12 | Must | **Per-leg interval and priority** from the M2 location profile: walk 2 s `HIGH_ACCURACY`; wait 5 s `BALANCED`; ride 10 s `BALANCED` until 3 stops before alighting, then 2 s `HIGH_ACCURACY`; last walk 2 s `HIGH_ACCURACY`; low-battery mode (M5 AC 8) widens only the mid-ride interval to 15 s. `setInterval` is called on each leg change; a JVM unit test checks the table |
| 13 | Must | **Stop in the notification** (OQ7): opens the app on the End-trip confirm sheet (M2 AC 45) instead of ending silently; Android 14+ swipe-dismissal of the ongoing notification does **not** stop the trip (it is re-posted on the next step change) |
| 14 | Must | **No Play services** (e.g. Huawei): the service falls back to `LocationManager` GPS + network providers with the same intervals; a JVM test with a fake provider covers it; the device script notes the result if such a phone is available |
| 15 | Must | With the screen off for ≥ 3 min on a real device: fixes keep arriving with max gap ≤ 2 × the leg interval + 5 s (spike target: > 60 hidden fixes in 3 min walking, max gap < 10 s) |

### D. Cues driven by location fixes (backup alert)
| # | Pri | AC |
|---|---|---|
| 16 | Must | **Guidance runs on fixes, not timers:** in native mode the trip runtime's cue decisions (advance, countdown, get-off next/now, off-route, arrival, share PUT cadence) are evaluated on each `fix` event (and on stop-list changes), never on `setTimeout`/`setInterval` deadlines. Timeouts that must exist (e.g. "no fix for 30 s → weak GPS") are checked on the next fix or by the native service. A unit test with fake timers frozen still completes the bus-only replay with the full alert sequence |
| 17 | Must | **Native backup alert:** at the start of each ride leg, the runtime arms `armAlert` twice — "get off at the next stop" (radius around the stop before the alighting stop) and "get off now" (alighting stop) — with the zh/en text. On the first qualifying fix the **service itself** posts the alert, vibrates and speaks, even if the WebView is throttled or its JS is paused |
| 18 | Must | **No double alerts:** each alert has an id (`trip:leg:kind`); whichever side fires first (JS or native) marks it fired in the service; the other side skips it. A test kills the JS side (no JS listener) and the native alert still fires once; with both alive it fires once |
| 19 | Must | Native and JS alerts **disarm** on End, re-route (re-armed for the new legs), off-route on a ride leg, and arrival |
| 20 | Must | **Share keeps going while locked:** share PUTs (M4 cadence) are sent from fix events; the share status stays `travelling` while the FGS runs with the screen off (not `paused`, which in the app means the trip itself is paused or the service is gone). The two-browser test's native variant (emulator or device) shows the family page moving with the senior's screen off |

### E. Lock-screen alerts
| # | Pri | AC |
|---|---|---|
| 21 | Must | Notification channels created once, zh/en names: `trip` (ongoing, low), `alerts` (IMPORTANCE_HIGH, VISIBILITY_PUBLIC, vibration pattern `get_off`, sound default, CATEGORY_NAVIGATION/ALARM per the spike), `info` (arrival, share ended; default). Alert text shows on the lock screen in full ("下一站下车 · Toa Payoh Int" — stop name only, no coordinates). Tapping opens H6/H6b |
| 22 | Must | The alert re-buzzes once after 20 s (fix-driven) if not acknowledged, then stops (M2 escalation parity); an "知道了 / OK" action acknowledges it from the lock screen |
| 23 | Should | When Do Not Disturb is on, the alert channel asks once (explainer as in AC 27) for "override Do Not Disturb" via the channel settings screen; if refused, the app notes it in Settings ("勿扰模式下可能没有声音") |

### F. Back
| # | Pri | AC |
|---|---|---|
| 24 | Must | **System Back follows the in-app page stack:** the `backButton` listener calls `history.back()`; after every navigation `toggleBackButtonHandler({enabled: depth > 0})`. Sheets, dialogs and the search field close first; H5 → End-trip confirm (M2 AC 45); at the root the system owns Back and the app leaves (never `finish()` from JS, never stuck) |
| 25 | Must | **Predictive back** enabled (`enableOnBackInvokedCallback="true"`): on Android 15+ the back-to-home preview plays at the root. QA tests Back (button and gesture) on every screen and state as a standing gate item (process §7) |

### G. Permission UX
| # | Pri | AC |
|---|---|---|
| 26 | Must | **Location:** before the system dialog, the M1 H4 explainer (Creative native variant) says why and that the app asks "only while using the app"; the app never asks for "Allow all the time". Denied → manual mode (M2 AC 4); "Don't ask again" → a button to the app's settings page (`ACTION_APPLICATION_DETAILS_SETTINGS`) |
| 27 | Must | **Notifications (Android 13+ `POST_NOTIFICATIONS`):** asked at the first Start with a one-line explainer (QA-21 ruling parity), only once; denied → H5 shows "锁屏时不会提醒你下车 · 打开通知" with a settings button, and voice + vibration still work |
| 28 | Must | Permissions in the merged manifest equal **exactly** the allow-list: INTERNET, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, POST_NOTIFICATIONS, VIBRATE, WAKE_LOCK, `<appId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; components: one activity, TripService (`exported=false`, type location), no receivers beyond androidx's. A gate step (`aapt2 dump badging` + `xmllint` on the merged manifest) fails on any difference; additions need a Director ruling |

### H. OEM battery-optimisation guidance
| # | Pri | AC |
|---|---|---|
| 29 | Must | A **"让手机别关掉怎么去 / Keep 怎么去 running"** screen with brand-specific steps for Samsung, Xiaomi/Redmi/POCO, OPPO/realme, vivo, Huawei/Honor, OnePlus and a generic Android version (by `Build.MANUFACTURER`), pictures drawn by Creative; one button opens the app's settings page / battery page where an intent exists (with a fallback to app details). Uses `PowerManager.isIgnoringBatteryOptimizations` only to show status ("已设置好 ✔"); never `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| 30 | Must | Shown once before the first trip (after permissions), skippable; reachable later from Settings and from a one-time H5 note if the service was killed during the last trip (detected on resume) |

### I. Release signing and versions
| # | Pri | AC |
|---|---|---|
| 31 | Must | **Keystore custody (OQ2):** the release keystore is created and kept by the **owner** (two backups: password manager + offline copy); it is never committed, never pasted into chat, never stored in this environment unless the owner explicitly decides so. The repo has `scripts/android/new-keystore.sh` (owner runs it once: `keytool`, RSA 4096, validity 30 years) and `scripts/android/sign-release.sh <unsigned.apk>` (zipalign + `apksigner sign` + `apksigner verify --print-certs`), reading the keystore path and passwords from the owner's environment, not from files in the repo. `.gitignore` and the secret scan reject `*.jks`, `*.keystore`, `*.p12`, `keystore.properties` |
| 32 | Must | **Two signing identities:** release builds = owner key, appId `<appId>`; QA/test builds = a throwaway test key in the build environment with `applicationIdSuffix ".qa"` and label "怎么去 QA", so a test build installs **beside** the owner's real app and is removed after the session (device rules) |
| 33 | Must | **versionName** = the web version (e.g. `1.0.1`); **versionCode** for a release is **N = (MAJOR·10000 + MINOR·100 + PATCH) · 100** (1.0.0 → `1000000`, 1.0.1 → `1000100`), hotfix rebuilds N+1…N+9, test builds N+10…N+99 (ROADMAP: release N, hotfix N+1, test ≥ N+10). `src/android/release-history.json` records every released code; the gate fails if a new release code is not greater than the last one |
| 34 | Must | **Signature check:** the release gate verifies the signed APK's certificate SHA-256 equals the fingerprint recorded in `src/android/release-cert.sha256` (public, committed on the first release), so an update can never ship with a different key |

### J. R8 and release smoke
| # | Pri | AC |
|---|---|---|
| 35 | Must | Release builds use **R8 with `minifyEnabled` and `shrinkResources`** plus keep rules for Capacitor (`@CapacitorPlugin`, `@PluginMethod`, bridge classes), TripPlugin/TripService and play-services-location (OQ8). `mapping.txt` is archived beside the gate report (not published) |
| 36 | Must | **Release smoke on a real runtime:** the R8 release APK (test-signed `.qa` variant of the same build) is installed on an emulator if available (OQ5), else on the owner's phone under the device rules, and exercises: launch → Home renders; search (live or fixture); route detail with map; Start → TripService notification appears; plugin calls `setInterval`, `armAlert`, `updateNotification`, `stop` succeed; TTS speaks; an alert notification posts; Back from 3 depths then exit; End. Hook lines in logcat (tag `howtogo`, no coordinates) are the evidence |
| 37 | Must | Release logcat contains no coordinates, place text, share ids, tokens or URLs with queries (grep in the smoke); `android:debuggable=false`, `allowBackup=false` (her places and contacts don't go to cloud backups without her knowing, OQ10), cleartext traffic off |

### K. Sideload distribution page
| # | Pri | AC |
|---|---|---|
| 38 | Must | **`/android`** page on the production Worker (zh/en, Creative frames): what the app adds ("锁屏也能提醒你下车"), a big Download button, version, size, date, **SHA-256** of the APK, requirements (Android 7+; best on 10+), and illustrated install steps: download → open → allow "install unknown apps" for the browser/Files → Install → Play Protect "Install anyway" explained calmly → open → permissions. Update steps (install over the old one; same key, data kept) and a "never uninstall to update — you lose your places" warning |
| 39 | Must | The APK file is served from storage the Worker can stream (OQ3: R2 bucket bound to the Worker) at `/android/howtogo-<versionName>.apk` with `Content-Type: application/vnd.android.package-archive` and `Content-Disposition: attachment`; `/android/latest.json` = `{versionName, versionCode, sha256, size, date}`. Only gate-passed, owner-signed APKs are uploaded; `smoke:deploy` checks the served file's SHA-256 equals `latest.json` |
| 40 | Should | **Update notice in the app:** once a day on launch (never during a trip) the app reads `/android/latest.json`; a newer `versionCode` shows "有新版本 · 去下载" linking to `/android` (no in-app install). The web app on Android Chrome shows a dismissible "Get the Android app — works with the screen off" card in Settings (not on Home, not during a trip) |

### L. Real-device test and battery
| # | Pri | AC |
|---|---|---|
| 41 | Must | **Real-device script** `qa/manual/android-device.md` (below) under the process §5 rules, run by the owner or by QA on the owner's phone with the owner's OK; results table filled; failures triaged S1–S4 |
| 42 | Must | **ROADMAP exit:** on a real phone, a **locked-screen bus trip** gives the voice and the lock-screen "下一站下车" at the stop before the alighting stop and "现在下车" at the alighting stop, with vibration, and the family page keeps updating |
| 43 | Must | **Battery ≤ 8 %/h** with the screen off during guidance (1 h mixed trip or a 1 h replay walk, owner's phone, Settings → Battery app usage or the battery % delta), normal mode; recorded with phone model and Android version. Over budget = S2 against §C intervals/priorities |
| 44 | Should | Emulator replay `qa/android/geo-replay.sh` (if an emulator runs, OQ5): `adb emu geo fix` feeds the three M2 GPS replays at real speed with the screen off (`input keyevent 26`), asserting the logcat hook sequence (step changes, alerts fired once, service stopped on arrival) |

### Entry-point parity (new M6 items)
| Surface | Permission explainers | Battery guide | Notify-denied note | Update notice | Get-the-app card |
|---|---|---|---|---|---|
| First trip (Start) | ✔ location, notifications | ✔ once | ✔ on H5 | — | — |
| H5 / pocket view | — | one-time note after a kill | ✔ | never | never |
| Settings | links to app settings | ✔ | ✔ | ✔ | web on Android only |
| Home | — | — | — | ✔ (daily) | — |
| `/android` page | — | linked | — | — | — |

## Testability
| What | How | Needs |
|---|---|---|
| Adapter (native.ts) | vitest with mocked Capacitor plugins: watch/current paths, voice fallback, notify mapping, capability flags | — |
| Fix-driven cues | vitest: replay with timers frozen; JS alert vs native alert dedupe via a fake TripPlugin | — |
| Trip service logic | JVM unit tests (interval/priority table, alert radius checks, dedupe ids, LocationManager fallback with a fake provider, notification text) — `gradle testReleaseUnitTest` | — |
| Manifest / permissions / components | gate step on the merged manifest + `aapt2 dump badging` vs the allow-list | — |
| Signing, versionCode, cert | `apksigner verify --print-certs`, release-history check, cert fingerprint check | Owner-signed APK for release; test key for QA |
| R8 release smoke | install the `.qa` R8 APK; scripted flow + logcat hooks | Emulator (OQ5) or owner's phone |
| Back | emulator `adb shell input keyevent 4` per screen, or device script | Emulator or device |
| Distribution page | Playwright on `/android` (zh/en, 200 %, axe), `smoke:deploy` checks the APK hash and headers | R2 bucket (OQ3) |
| **Needs a real phone** | screen-off fixes, lock-screen heads-up, zh TTS while locked, DND, OEM killing, predictive back animation, battery, sideload install/update UX | Owner's Android phone (≥ Android 10, ideally Samsung 14/15) |

### Real-device script (owner or QA with the owner's OK; ≈ 30 min + one bus trip + 1 h battery run)
Device rules: personal profile only; check the app is in the foreground before any tap; no unlock by QA, no reboot, no global settings beyond the approved list (the app's own permissions and battery setting); install **in place**; a QA build is the separate `.qa` package and is removed at the end; leave with Home.
1. Note phone model, Android version, battery %. Open `/android` in Chrome, download, check the SHA-256 shown, install (allow unknown apps for Chrome; Play Protect → Install anyway).
2. Open 怎么去: first run → location explainer → "While using the app"; the app never asks "Allow all the time".
3. Battery guide appears: follow it for this brand; status shows ✔.
4. Plan a short bus trip; Start → notifications explainer → Allow. The "行程进行中" notification shows the current step.
5. Share the trip with the owner's second phone (family page open there).
6. Lock the phone, put it in a pocket. Ride. Expect: voice + three buzzes + lock-screen "下一站下车" one stop before; "现在下车" at the stop. Family page keeps moving.
7. Unlock: the app is on the right step. Pull down the notification → Stop → the app opens on "要结束这次行程吗？" → Keep going.
8. Back from Settings → Home → leaves the app (Android 15: back-to-home preview).
9. Turn on DND, run the demo replay: note whether the alert sounds/vibrates.
10. Battery: one 1 h screen-off trip (or walk); note the % used (target ≤ 8 %).
11. Update test: install the next build over the old one (from `/android`); places and contacts are still there.

## QA gate scope
- Web gate (M5) green on the same commit; then the Android steps: `npm run android:release` builds; JVM unit tests; manifest/permission/component allow-list; lint 0 errors; 16 KB alignment; APK size; versionCode > last release; cert fingerprint matches; secret scan incl. keystore patterns; logcat redaction grep; artifact `howtogo-<ver>.apk` + `.sha256`.
- R8 release smoke (AC 36) on an emulator or the owner's phone.
- Every Must AC mapped to a test ID in `qa/reports/<ver>-android.md`.
- Owner items read from notes: real-device script, locked-screen bus trip (exit), battery ≤ 8 %/h.
- Not in scope: Play policies, iOS.

## Open questions (with recommended defaults)
| # | Question | Default | Who |
|---|---|---|---|
| OQ1 | **appId** (permanent once anyone installs it) | `sg.howtogo.app` unless the owner owns a domain, then its reverse (e.g. `com.<ownerdomain>.howtogo`). Decide **before** the first APK leaves the team | **Owner** |
| OQ2 | **Keystore custody and where signing happens** | The owner creates the key on their own computer with `new-keystore.sh` and signs each release there with `sign-release.sh` (the team hands over the unsigned R8 APK + its SHA-256). Two backups. Alternative: the owner stores the keystore as an environment secret file so the Director can sign — only on the owner's explicit choice | **Owner** |
| OQ3 | Where the APK is hosted (5+ MB can't be embedded in the free-plan Worker bundle, D-10) | An **R2 bucket** `howtogo-dl` bound to the production Worker, served under `/android/` (free tier). If the Cloudflare token can't manage R2, the owner uploads the APK in the dashboard (2 min) | Director (+ owner if dashboard upload) |
| OQ4 | Minimum Android version | **minSdk 24** (Android 7, as the spike); support and test only **Android 10+**; the page says "best on Android 10 or newer" | Director |
| OQ5 | Emulator in this container? (no KVM seen in the spike) | Try once (`emulator -accel` check); if there is no acceleration, use JVM tests + the owner's phone for the R8 smoke and Back; AC 44 becomes BLOCKED, not FAIL | Director |
| OQ6 | Huawei/Honor without Google Play services | **LocationManager fallback is Must** (AC 14); OneMap tiles and TTS may still be missing (the page says "Huawei phones without Google: may not speak Chinese") | Director |
| OQ7 | Notification **Stop**: end at once or confirm? | **Open the app on the End-trip confirm** (pocket taps are the risk; consistent with M2 AC 45). The spike's direct stop is replaced | Director |
| OQ8 | R8 on or off? | **On** with keep rules and the release smoke (smaller APK, process §4); fall back to off only if a keep rule can't be found within the round, logged as a ruling | Director |
| OQ9 | Release order and version line | Web **1.0.0** first (M5); the APK ships as **1.0.x** of the same version (versionName = web version) once the locked-screen bus trip passes | Director |
| OQ10 | `allowBackup` | **false** (no silent Google backup of her places/contacts); the caregiver setup link (M4) is the restore path on a new phone | **Owner** (privacy, FYI) |
| OQ11 | Who can access the `/android` page? | Public, no login (the APK has no secrets); not linked from Home on iOS or desktop; `noindex` | Director |

## Creative frames needed
- **Adaptive icon** set from logo B (foreground, background, monochrome) and the splash; notification small icon (mono, 24 dp).
- **Permission explainers** (native variant): location, notifications; denied states and "open settings" sheets; DND note.
- **Battery guide** screen: generic + 6 brand variants with simple drawn step pictures; status ✔ line; the one-time H5 note after a kill.
- **Notification copy and layout:** ongoing "行程进行中" (step text template, Stop action), alert notifications (next stop / now / off route, "知道了" action), arrival, share ended — zh/en, lock-screen truncation rules.
- **No Chinese voice** sheet; **WebView too old** screen.
- **`/android` download page** (zh/en, phone and desktop widths): hero line, Download button, version/size/SHA-256 block, illustrated install steps, Play Protect explainer, update steps, uninstall warning.
- **Update notice** (in app) and the **Get-the-app card** (web Settings, Android only).
- Each: light/dark, 100/200 %, SR labels, Back target, baseline names.

## Estimate (wall clock, straight through)
| Step | Hours |
|---|---|
| Shell to production: real app in the WebView, assets/icons, SW off, CORS origin, WebView check, harness excluded | 0.75–1 |
| Adapter `native.ts` + runtime selection + tests | 0.75 |
| TripService: per-leg intervals/priority, LocationManager fallback, Stop → confirm, notification text, JVM tests | 1–1.25 |
| Fix-driven cues, native backup alert arm/disarm, dedupe, share while locked | 1 |
| Back + predictive back, permission UX, OEM battery guide | 1 |
| Release: R8 + keep rules, signing scripts, versionCode/cert checks, manifest allow-list gate step | 1–1.25 |
| `/android` page, R2 hosting, latest.json, update notice | 0.5–0.75 |
| QA gate + R8 release smoke + one fix round | 1–1.5 |
| **Total** | **7–9 h** (+ owner: appId/keystore ≈ 20 min, signing per release ≈ 5 min, device session ≈ 30 min + bus trip + 1 h battery run) |
