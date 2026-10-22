# Audit (2026-10-20)

> **Status (2026-10-22):** snapshot kept for its IDs. Progress is tracked in ROADMAP phase 9;
> the unticked items there are what is still open (C3 device test, B7, a few features).

Third full review of the codebase (after the ones behind ROADMAP phases 7 and 8), covering
features, code, UI/UX and next steps. Nothing was changed while auditing.

**Verdict.** The codebase is healthy: 172/172 tests pass, the build passes, there is
almost no dead code and the conventions are followed. The remaining risks lie elsewhere:
privacy and safety promises that the code does not keep, async failures with no feedback,
scaling on large archives, and four broken flows.

Nothing was tested on an Android device: points that depend on the native shell are marked
*to verify*.

IDs: **C** critical, **I** important, **B** bonus (code), **U** UI/UX.

---

## 1. Feature map

| Area | State | Notes |
|---|---|---|
| Import: GPX/TCX/FIT/.gz, Strava .zip archive, Health Connect, indoor files, duplicates | Complete | Strava CSV headers read in English only (I8). Health Connect never tested on a device |
| Activity detail: stats, 2D/3D map, synced profile, splits, GAP, HR zones, Relative Effort, power, intervals, matched activities, segments, photos, crop, elevation correction, undo delete | Complete | I6 |
| Sharing: 4 story templates, 3 backgrounds, GPX, privacy zones | Complete | Wrong photo when sharing from the feed (I4) |
| Live recording: GPS, auto-pause, laps, countdown, voice, HR alert, custom screen, BLE sensors, structured workout, route following, live segments, draft | Complete on the web | Screen-off recording on Android *to verify*. A lost sensor cannot be reconnected (I3) |
| Manual entry | Complete | B8 |
| Profile, training log, goals, achievements, gear, race predictions, fitness | Complete | Records are run-only. Fitness & Freshness broken without HR (I2) |
| Maps, heatmap, BRouter route builder, suggestions, offline maps | Complete | Depends on the public BRouter and Carto servers. Slow on large archives (I10) |
| Groups: monthly challenges, trophies, friend challenges by link | Complete (local) | No community: a documented decision |
| Safety: contacts, check-in, SOS | Partial | Pre-filled SMS only. Check-in tied to the foreground screen (C3) |
| Settings, backup/restore, FR/EN, units, themes | Complete | Backup built entirely in memory (I11) |
| Native shell | Partial | Android only, never validated on a device. No iOS |
| Accounts, sync, shared leaderboards, live location sharing | Missing | Phase 3 (backend) |

**Placeholders:** every feed card shows "Athlète Allure" and the "A" avatar. The
"popularity" of suggested routes is only the athlete's own heatmap.

**Broken flows:** I1 (watch heart rate after a recording), I2 (Fitness & Freshness without
HR), I3 (sensor lost mid-recording), I4 (wrong photo in a story shared from the feed).

---

## 2. Technical audit

### Critical

- **C1: privacy zones can be reversed.** `lib/privacy.js:9-17` cuts the track exactly at the
  edge of a circle centred on the home itself (`PrivacyZones.jsx:24`). With two or three
  shared stories or GPX files, the centre can be found by triangulation. Fix: offset the
  centre at random when the zone is created (stored value), and cut at a random extra
  distance beyond the radius.

- **C2: the privacy policy is wrong on three points** (store rejection and GDPR risk).
  - **AWS receives the area of every recorded activity.** `correctElevation` downloads the
    z12 DEM tiles of the track at the end of every recording (`recording.js:125`). The
    policy only mentions "the area shown in 3D" and says no activity is sent
    (`LegalPage.jsx:45,49`, and the English version).
  - **"Location only while recording" is false** (`LegalPage.jsx:32`,
    `SettingsPage.jsx:146`). The Maps tab follows the position and stores it as `lastPos`
    (`MapsPage.jsx:43-55`). The record setup screen turns the GPS on
    (`RecordPage.jsx:63`). The route builder has a GeolocateControl, and adding a privacy
    zone offers "Ma position".
  - **`android:allowBackup="true"`** (`AndroidManifest.xml:6`): Android Auto Backup can copy
    the WebView's IndexedDB (GPS tracks, heart rate) to Google Drive, while the policy says
    nothing leaves the phone (`LegalPage.jsx:52`). *To verify.* Fix: explicit
    `dataExtractionRules`, or disclose it in the policy.

- **C3: the safety check-in is unreliable exactly when it matters** (phone in a pocket,
  screen off). *To verify on a device.*
  - It lives in the `CheckIn` component, mounted only on the live screen
    (`RecordPage.jsx:253`).
  - It runs on WebView JS timers, which are throttled in the background.
  - Opening the SMS automatically (`RecordPage.jsx:273`) is blocked by Android 10+ when the
    app is not in the foreground.
  - The option is on by default (`RecordPage.jsx:57`): the athlete believes they are
    protected.

  Fix: test on a device; if it fails, a native full-screen local notification (needs a
  plugin, to approve) and an honest warning text.

### Important

- **I1: the watch's heart rate is never fetched automatically after a recording.** In
  `App.jsx:212-216`, after `await reload()`, `listed.current` still holds the previous list
  (React 18 has not rendered yet). Filtering it on `rid` returns nothing, so the call with
  `prompt: true` never happens. Fix: have `reload` return the list and filter that.
- **I2: Fitness & Freshness is hidden for an athlete without HR**, although perceived
  exertion is meant to feed it. `FitnessChart.jsx:12` only checks `hrTime`. Fix: add
  `|| a.rpe`.
- **I3: a sensor lost mid-recording cannot be reconnected.** The toast says to reconnect it
  from the record screen (`App.jsx:66`), but `SensorButton` only exists on the setup screen
  (`RecordPage.jsx:116-118`). The live screen has none.
- **I4: a story shared from the feed can use another activity's photo.** `ShareSheet` stays
  mounted in the feed (`FeedPage.jsx:60`). Its `photo` / `bg` state (`ShareSheet.jsx:14`)
  survives from one activity to the next: the photo picked for A becomes B's background,
  which can publish a private photo. The activity's own photos are not passed either. Fix:
  `key={shared?.id}` and pass `photos`.
- **I5: async failures show no message.** There is no global `unhandledrejection` handler,
  and several async functions have no `catch`:
  - `App.jsx:106-117` and `App.jsx:276`;
  - `ActivityPage.jsx:58-79`;
  - `RecordPage.jsx:77`;
  - `RecordPage.jsx:203-208`: when finishing a recording, a quota error shows nothing (the
    draft is kept);
  - `RoutePage.jsx:82-93`, `ManualPage.jsx:41-51`, `FeedPage.jsx:15-18`,
    `Photos.jsx:14-27`, `SettingsPage.jsx:79-82`.
- **I6: elevation correction can be triggered by accident and cannot be undone.** A
  `<label>` wraps the button (`ActivityPage.jsx:245-254`, same for the watch heart rate at
  `255-266`), so tapping the hint text runs the action. The original altitude (e.g.
  barometric) is overwritten with no confirmation and no undo. Fix: a `<div>` instead of
  the `<label>`, and a `ConfirmButton`.
- **I7: GPS drift while stopped inflates the distance.** `recorder.js:128` stores every
  point 3 m or more away, even during auto-pause (`moving` false), and adds it to the
  distance. On save, `analyze()` recomputes moving time: jitter jumps above 0.5 m/s count
  as movement. The live clock and the saved activity no longer agree. *Size to measure on a
  device.*
- **I8: Strava archive from a French account.** `importer.js:43,51` reads the `Filename`,
  `Activity Name` and `Activity Type` columns. Strava localizes these headers to the
  account language (*to verify with a real French archive*). If so, names and sports are
  lost and the import falls back to the file's type, or `run`. Fix: map French and English
  headers, or fall back to column positions.
- **I9: battery drain on long recordings.** `LiveMap.jsx:37-42` sends the whole track as
  GeoJSON on every fix and runs an `easeTo` every second. Six hours at 1 Hz is about 21,600
  points serialized per update. Fix: thin the track (`thin`), or send only its tail.
- **I10: slow on large archives.** `MapsPage.jsx:57-64` reads every full track each time
  Maps opens, and on every new list (including the heart-rate refresh when returning to the
  app). `SuggestPage.jsx:44` does the same. Fix: cache the thinned lines by id, or store a
  thinned polyline on the meta.
- **I11: the backup is built entirely in memory.** `db.js:237-257` loads every track and
  every photo as a data URL, then `JSON.stringify` runs on all of it (`MyData.jsx:28`).
  Restore does the same with `file.text()`. Out-of-memory risk in the WebView, on the only
  protection against data loss. Fix: export in chunks (NDJSON). *Measure with 1,000
  activities.*
- **I12: IndexedDB migrations are untested.** `db.js` (MIGRATIONS, backfill, restoreAll)
  has no test: a broken migration means lost data on update. Fix: extract the pure patch
  functions and test them; an integration test would need `fake-indexeddb`, a new
  dependency to approve.
- **I13: `App.jsx` is too large.** Its 332 lines repeat `useState` + `useEffect` + `save`
  for each of nine settings, and `SettingsPage` gets 18 props (`App.jsx:291`). Fix: a
  `useSetting(key, default)` hook, about 40 lines less.

### Bonus

- **B1: untranslated strings**, shown in French in the English UI:
  - `location.js:21,46`
  - `formats/fit.js:13,16`
  - `formats/tcx.js:10`
  - `formats/zip.js:15,25`
  - `story.js:64`
  - `demo.js:101`
  - `global.css:81` (`content: 'Dépose tes fichiers'`)

  The i18n test only sees strings passed through `t()`.
- **B2:** `exportAll` reads keys and values in two separate transactions
  (`db.js:240-241`, `244-245`). A write between them misaligns photos or settings. One
  transaction is enough (as in `loadDraft`).
- **B3:** `onversionchange` closes the connection but keeps `dbPromise` (`db.js:87`). The
  older tab then fails on every request, draft autosave included. Fix: reset `dbPromise`
  and ask for a reload.
- **B4:** in `RestingHrPlugin.kt:52`, two close `read({ prompt: true })` calls overwrite
  `pending`. The first promise never resolves.
- **B5: duplicated code.**
  - MapLibre setup in four copies: `LiveMap.jsx:9`, `TrackMap.jsx:11`, `MapsPage.jsx:19`,
    `RoutePage.jsx:22`.
  - Three identical `fmtDay` (`FitnessChart.jsx:7`, `FriendChallenges.jsx:11`,
    `RacePredictions.jsx:4`), plus about nine inline `toLocaleDateString` calls.
  - Three `num()` helpers that behave differently.

  Fix: date formatters in `lib/format.js`, one `createMap()` helper.
- **B6:** the demo data (58 KB) is in the start-up bundle (checked in a build). It comes in
  through static imports in `App.jsx:8` and `location.js:7`. Fix: dynamic `import()`.
- **B7:** `liveGain` re-smooths the whole track every second (`liveFields.js:56,64`) from
  raw GPS altitude. The saved activity uses the DEM: the live elevation gain differs from
  the final one.
- **B8: missing validation.**
  - The HR alert threshold accepts 1 bpm (`SettingsPage.jsx:200-201`).
  - A workout with 0 reps is possible (`WorkoutEditor.jsx:5`).
  - Manual entry accepts negative values, and a double submit creates a duplicate
    (`ManualPage.jsx:12,41-51`).
  - Opening `#/manual/<id of a GPS activity>` overwrites its preview and records
    (`ManualPage.jsx:19,48`).
- **B9:**
  - Each suggestion fires 12 BRouter requests in parallel (`SuggestPage.jsx:302`): a 429
    (rate limit) is likely, and the "check your connection" message is then misleading.
  - A failed leg is never retried (`RoutePage.jsx:66-76`).
- **B10:** no Content Security Policy in `index.html`.

---

## 3. UI/UX

### Important

- **U1: tap targets under 44 px**, against the CLAUDE.md rule.
  - `.segmented button`: 36 px (`global.css:393`), used everywhere.
  - `.small`: 38 px (`global.css:123`), including the ✕ delete buttons.
  - `.icon`: 40 px (`global.css:408`).
- **U2: toasts do not go away on their own.** Only the undo toast has a `ttl`
  (`App.jsx:235-240`). Import summaries, goals reached and errors stay at the top of the
  screen until tapped. The toast is a clickable div with no button role (`App.jsx:310`).
- **U3: inconsistent back navigation.** The activity page's back arrow always goes to the
  feed (`ActivityPage.jsx:178`), even when coming from the training log, the calendar, a
  segment or matched activities: context and scroll position are lost. The swipe-back
  gesture is missing on Settings and Legal (`App.jsx:55`).
- **U4: inconsistent deletes.** A goal, a privacy zone or a contact is deleted with one tap
  (`Goals.jsx:29`, `PrivacyZones.jsx:39`, `EmergencyContacts.jsx:35`), while everything
  else goes through `ConfirmButton`.
- **U5: missing loading states.**
  - The feed is blank while loading (`FeedPage.jsx:40`).
  - The profile shows "0 activité" before loading (`ProfilePage.jsx:27`).
  - An unknown `#/manual/<id>` gives a blank page (`ManualPage.jsx:20`).

  Only the activity detail has a skeleton.
- **U6: the live map re-centres every second** (`LiveMap.jsx:41`). The athlete cannot look
  further along the route.

### Bonus

- **U7: no type scale.** 18 different font sizes (9 to 160 px) and 16 border radii, while
  `--radius` exists and is used only 7 times. 9-10 px text at `global.css:258,335,427`.
- **U8: colours.** Well tokenized. Hard-coded leftovers: `.pin.me` (`global.css:520`),
  `.danger.armed` `#fff` (`global.css:125`). Stories keep a fixed orange whatever the accent
  (`story.js:80-81,172,226-227`).
- **U9:** every feed card shows "Athlète Allure" even when a name is set
  (`ActivityCard.jsx:22-24`).
- **U10: imperial units.** Privacy zone radii stay in metres (`PrivacyZones.jsx:38,49`).
  Race predictions show "km" (`RacePredictions.jsx:5`).
- **U11:** the crop and segment sliders move one point per step (`ActivityPage.jsx:288,291`,
  `SegmentEfforts.jsx:74,77`). That can be 20,000 steps over 390 px: fine adjustment by
  finger is impossible. Fix: ± buttons, or steps in metres.
- **U12:** a recording recovered after a crash stays paused, with no sign of it on the tab
  bar.
- **U13:** `Segmented` declares `role="radio"` but has no arrow-key navigation.

---

## 4. Recommendations

### Quick wins

1. **Global safety net** in `App.jsx`: an `unhandledrejection` listener that shows a toast.
   About three lines, covers I5.
2. **I1, I2 and I4**: one-line fix each.
3. **44 px tap targets**: three lines of CSS (U1).
4. **Toasts**: default `ttl` of 5 s for notices, errors stay (U2).
5. **Self-hosted Inter font** (`index.html:8`) and **demo data loaded on demand** (B6).
   Today the native app without a network falls back to a system font, and it removes a
   Google request, which also helps the GDPR point of C2.

### New features

**Important**
- **Automatic weekly backup** to Documents, through `@capacitor/filesystem` (already
  installed). Without a backend, it is the only real protection against data loss.
- **Feed search and filters**: required once a 1,000-activity archive is imported
  (ROADMAP phase 7).
- **Records beyond running**: rides, hikes, biggest climb. `bestEfforts` already exists
  (ROADMAP phase 8).
- **Import a GPX as a route** (ROADMAP): less reliance on BRouter.
- **Robust privacy zones** (C1), plus a "hide the map" option when sharing.

**Bonus**
- Compare two activities, or race a past one (`matched.js` and `follow.js` can be reused).
- Weather at the start through Open-Meteo, no key needed.
- Pace zones for runners without a strap.
- Indoor recording: `indoorActivity` already exists.
- Keep the original track before a crop or an elevation correction.
- "Recording in progress" badge on the tab bar.
