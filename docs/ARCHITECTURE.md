# Architecture

## Target vs. current

The product is a **mobile app** (iOS + Android). Today the code runs as a web app in
the browser for development speed. It will be packaged in a native shell later (see
`DECISIONS.md`). Platform-dependent capabilities (GPS, storage, sharing, Bluetooth,
background execution) must sit behind small modules in `src/lib/`, so a native plugin
can replace the web API without touching components.

## Current state (phase 1, local-first)

Client-only React app with a bottom tab bar and hash routing. Activities are stored on
the device in IndexedDB. There is no backend and no account.

```
.gpx/.tcx/.fit(.gz) ─┐
Strava .zip archive ─┴► lib/importer (collectTasks → parse → dedupe) ─┐
demo ──────────────────► lib/demo.demoHistory ────────────────────────┤
                                                                      ▼
                     lib/activity.createActivity ─► { meta, points } ─► lib/db (IndexedDB)
                                                                           │
  FeedPage, ProfilePage ◄── listActivities() (meta only) ◄─────────────────┤
  ActivityPage ◄── getActivity(id) ─► lib/analyze ─► stats, map, chart, splits, best efforts
                                              ├─► lib/story.exportStory ─► PNG ─┐
                                              └─► lib/formats/gpxExport ─► GPX ─┴► lib/share
```

## Routing

`src/router.js`: hash routes, so it works in a native WebView without server rewrites.
Route changes run inside `document.startViewTransition` (slide or fade, see
`data-nav` in the CSS). The router also restores each route's scroll position.

| Hash             | Page           |
|------------------|----------------|
| `#/`             | `HomePage` (Home tab, "Entraînement"): the plan's race countdown, next session, week strip and volume; without a plan, goal picker and workout library |
| `#/plan`         | `PlanPage`: phases chart, every week of the active plan with done / missed marks (`matchSessions`), run days change. `#/plan/session/:id`: one session's steps and paces, start, what was done, move / swap, skip, make up, link a run by hand |
| `#/plan/new(/:goal)` | `PlanSetupPage`: wizard (goal, race date, fitness, volume and experience, run days), prefilled by `planDefaults`, ending on a preview |
| `#/activities`   | `FeedPage` opened from the profile (header count, "Mes activités" row); it and the activity pages highlight the Profile tab |
| `#/activity/:id` | `ActivityPage` |
| `#/record`       | `RecordPage`: setup (sport, route to follow, workout, auto-pause, voice cues, GPS status), then live recording. `#/record/:routeId` preselects a route, `#/record/workout/:id` a workout (library id or `plan:<session id>`); today's plan session is preselected by default |
| `#/manual(/:id)`  | `ManualPage`: add an activity by hand (no GPS), or edit a manual one's date, duration, distance, D+ |
| `#/log`          | `TrainingLogPage`: week-by-week bubbles, opened from the profile |
| `#/segment/:id`  | `SegmentPage`: segment map, distance / grade, your efforts fastest first |
| `#/maps`         | `MapsPage` (tab): full-screen map around you; filter chips + Search route loops from the area in view (ranked on distance, difficulty, terrain, surface, novelty), drawn together and synced with a bottom carousel; Saved swaps in your routes; heatmap layer |
| `#/route/:id`    | `RoutePage`: route builder (`new`) or a saved route, editable |
| `#/groups`       | `GroupsPage` (tab): clubs and events (placeholders until accounts land) |
| `#/profile`      | `ProfilePage`  |

## Storage (`lib/db.js`)

IndexedDB database `allure`, version 7:

- `activities` (keyPath `id`): **meta** records, small enough to list everything at once
- `tracks` (key = activity id): raw **points** arrays, read only on the detail page
- `drafts`: the in-progress live recording, autosaved every 5 s, in parts so a save stays
  small: `current` (live state + point count), `static` (route, live segments), `p0`, `p1`…
  (500-point chunks). See `draftWrites` / `joinDraft` in `recorder.js`
- `settings` (key = setting name): user preferences, e.g. `hr` → `{ max, rest, ftp, weight /* kg */ }`,
  `goals` → `[{ id, sport, metric, period, target }]` (see `lib/goals.js`),
  `gear` → `[{ id, name, kind, initial, alert, isDefault, retired }]` (see `lib/gear.js`),
  `privacy` → `[{ id, name, lat, lon, radius }]` privacy zones (see `lib/privacy.js`)
  `contacts` → `[{ id, name, phone }]` emergency contacts (see `lib/safety.js`)
  `plan` → the active training plan `{ id, created, goal: { kind (GOALS or PROGRAMS key), date (race day, program end, null: open-ended) }, inputs, vdot, vdotHistory, weeks: [{ volume, kind, phase }], sessions: [{ id, date, week, phase, type, steps, distance, duration, status?, activity?, from?, heat?: { factor, temp, dew } }], reminder? (hour), adjustments: [{ kind: 'pace' | 'volume' | 'unwell', date, dismissed?, ... }] }` (see `lib/plan.js`, `lib/planAdapt.js`; done is computed from activities, never stored); `planHistory` → finished or stopped plans, with `ended` and `status`
  `units` → `'metric' | 'imperial'` display unit system (see `lib/format.js`)
  `lang` → `'fr' | 'en'` UI language, device language when unset (see `lib/i18n.js`)
  `prefs` → `{ name, autoPause, audio, recordScreen, workout, workouts }` display name and recording defaults (Settings page); `workout` is the custom workout template being edited, `workouts` the saved ones `[{ id, ...template }]`;
  `recordScreen` → `{ [sport]: { map, hero, fields } }` live screen layout (`lib/liveFields.js`)
  `friendChallenges` → `[{ id, title, metric, sport, from, to, entries, me }]` challenges with
  friends, shared as `#/challenge/<code>` links (see `lib/friendChallenges.js`)
- `segments` (keyPath `id`): user-created segments (see `lib/segments.js`)
- `routes` (keyPath `id`): planned route metas: waypoints, stats, preview (see `lib/routes.js`)
- `routeLegs` (key = route id): each route's points, read by `getRoute` (builder, recording)
- `photos` (key = activity id): the activity's pictures, an array of JPEG Blobs shrunk to
  1600 px on import (`shrinkPhoto` in `lib/story.js`); the first one is the default story
  background. Deleted with the activity
- Cache Storage (not IndexedDB): offline map downloads, one cache per route
  (`allure-route-<id>`, see `lib/offline.js`)

Schema changes bump `VERSION` and add an entry to `MIGRATIONS`, which run in order
inside the upgrade transaction:

| Version | Migration |
|---------|-----------|
| 1 | create `activities` and `tracks` |
| 2 | backfill `bestEfforts` on every meta from its track |
| 3 | create `drafts` |
| 4 | create `settings`, backfill `hrTime` on every meta from its track |
| 5 | create `segments` |
| 6 | create `routes` |
| 7 | create `photos` |
| 8 | recompute `movingTime` / `avgPace` of hikes, walks and swims (per-sport moving threshold) |
| 9 | move route `legs` into `routeLegs` |

Full backups (`lib/backup.js`, Profile → Mes données) dump every store except `drafts`
and the map caches to one JSON file (photos inlined as data URLs on their activity) tagged with `schema` = `VERSION`. Restore puts the
records back as they are, so a backup from a newer schema is refused. A migration that
backfills metas must also be applied to older backups on restore.

Open connections close on `versionchange`, so a newer tab can upgrade. If an older tab
still blocks the upgrade, `open()` rejects with a "close the other tab" message.

## Data model

```js
// Point: one GPS fix as read from the source
{ lat, lon, ele: number|null, time: msEpoch|null, hr: bpm|null, power?: watts }

// ActivityMeta: stored in `activities`
{
  id, name, sport,       // sport: 'run' | 'ride' | 'hike' | 'walk' | 'swim' (lib/sports.js)
  source,                // 'gpx' (any imported file) | 'demo' | 'record' | 'manual' (typed in, no points)
  date,                  // ms epoch (first point, or import time when no timestamps)
  distance, movingTime, avgPace, gain, avgHr,  // summary, same units as analyze()
  preview,               // ≤ 81 [lon, lat] pairs for feed thumbnails
  bestEfforts,           // { '1k': s, '5k': s, … } fastest elapsed time per distance
  hrTime,                // { [bpm]: s } moving seconds per heart rate (lib/training.js)
  efforts,               // [{ seg, time, from, to }] segment efforts: segment id, elapsed s, point indices
  laps,                  // device lap start times (ms), from FIT / TCX; only when 2+ laps
  workout,               // recorded in Allure only: { name?, steps } reached, one per lap; pace targets resolved to s/km, done `pace` per step (lib/workout.js)
  description, notes,    // free text; notes are private (never exported)
  rpe,                   // perceived exertion 1-10; effort source without heart rate (training.js)
  noRecords,             // true: left out of personal records and race predictions
  gear,                  // gear id (settings `gear`); `saveActivities` sets the sport's default
  avgPower, np,          // W, rides with a power meter only (lib/power.js)
  powerCurve,            // { [seconds]: best average W } for 5 s … 1 h
}

// Route: meta in `routes`, legs in `routeLegs` (getRoute joins them; backups keep them inline)
{ id, name, sport, snap, waypoints /* [lon, lat] */, legs /* Point[] per waypoint pair */, distance, gain, preview, created, updated }

// Segment: stored in `segments`
{ id, name, sport, points /* [lon, lat] every ~10 m */, distance, gain, grade /* avg % */, created }

// analyze(points, sport): computed on demand, never stored; splits come from computeSplits(track, size, sport)
{
  track: Point & { dist /* cumulative m */, ele /* smoothed */, gdist /* grade-adjusted m, with ele */ }[],
  distance, movingTime, elapsedTime, avgPace, gain, avgHr, date,
  gap,                   // grade adjusted pace, s/km (lib/gap.js, Minetti cost, downhill halved)
}
```

UI text: `lib/i18n.js` `t()` returns the French source string or its `lib/en.js` entry.
Like the units, the language is module state set by App before rendering; the page remounts
on change, and dates use `locale()`. Stored data (activity names) keeps the language it was
created in.

Units are SI everywhere (m, s, ms epoch). Display conversion happens in `lib/format.js`
and `lib/sports.js` (`effort()` picks km/h, min/km or min/100 m by sport).

## Algorithms

- **Distance**: haversine between consecutive points (`lib/geo.js`).
- **Moving time**: a segment counts if speed > 0.5 m/s and the gap is < 60 s, so
  device auto-pause gaps are excluded.
- **Elevation gain**: 7-point moving average before summing positive deltas. Raw GPS
  altitude noise would inflate D+ heavily.
- **Splits** (`computeSplits`): each segment is attributed to the split where it starts.
  Split size comes from the sport: 1 km, 5 km for rides, 100 m for swims. A trailing
  split under 2 % of the size is dropped.
- **Best efforts** (`lib/records.js`): a two-pointer sliding window on cumulative
  distance finds the fastest elapsed time over 1 km, 5 km, 10 km, half and full
  marathon, scaled to the exact distance. Personal records = the best of all runs.
- **Paces** (`lib/paces.js`): Daniels-Gilbert VDOT from a race time and back (bisection),
  training paces at fixed shares of VDOT (easy 65-74 %, threshold 88 %, interval 97.5 %,
  marathon from the race time, repetition 15 s/km under interval). Current fitness is the
  best VDOT of the last 90 days of runs, from efforts of 3 km or more when any. Time in
  pace zone takes pace over ~10 s chunks of moving time (point-to-point GPS pace is noise).
- **Plan adaptation** (`lib/planAdapt.js`): proposals only, logged in `plan.adjustments`
  (accepted or dismissed) so the same runs never ask twice. Pace check: a better current
  VDOT, or the done pace of work steps (stored on the activity's `workout`) against the
  target middle: 3 key sessions in a row > 2 % faster at RPE ≤ 7 → +1, 2 > 3 % slower or
  RPE ≥ 9 → -1; accepting re-estimates future sessions. Volume check: run distance of the
  last 3 plan weeks vs planned, < 75 % → hold next week then +10 %, > 115 % → warning.
  "Not feeling well" and "regenerate" rewrite sessions from today / next week, never the race
  or sessions already done or decided.
- **Duplicates on import**: same sport and overlapping time ranges, start to start + moving time (`isDuplicate`).
- **Profile stats** (`lib/stats.js`): local time, weeks start on Monday or Sunday (`setWeekStart`, a setting).
- **Segment efforts** (`lib/segments.js`): a pass starts at the fix closest to the
  segment start (within 30 m), must reach every segment point in order within 30 m, and
  ends at the fix closest to the end. A track longer than 1.5× the segment between the
  two is rejected. Going back through the start before any real progress (a spur, a
  U-turn) restarts the pass there. Time is elapsed, start to end. `saveActivities`
  matches new activities against every segment; `saveSegment` scans every track of the
  segment's sport.
- **Intervals** (`lib/intervals.js`): device laps when the file has them. On runs,
  efforts are also auto-detected: speed (grade adjusted when possible) is smoothed over
  ±15 s, split into two clusters, and the run is a workout only if fast is ≥ 1.3× slow,
  each pace fills ≥ 10 % of moving samples, and there are 2+ fast bouts. Bouts under
  20 s fold into their neighbours. Fixes under half the median speed (stops) keep the
  current label, so red lights don't make a workout.
- **Challenges** (`lib/challenges.js`): monthly challenges are computed from metas on the
  fly (nothing stored); a badge is a challenge completed within its calendar month.
- **Heatmap** (`lib/heatmap.js`): tracks are read with `thinTracks` (`db.js`), thinned to a
  point every 15 m and cached for the session by id and distance, and drawn as one faint line per activity so overlaps add up. The map
  opens on the ~50 km cell holding the most starts.

## Import (`lib/importer.js`, `lib/formats/`)

- `gpx.js`, `tcx.js`: DOMParser based. TCX input is trimmed, because Strava exports
  start with whitespace before `<?xml`.
- `fit.js`: official `@garmin/fitsdk`. Semicircles are converted to degrees. Lap start
  times are kept (`lapMesgs`), as in `tcx.js` (`<Lap StartTime>`).
- `zip.js`: reads only the central directory and the requested entries via
  `Blob.slice`, so multi-GB Strava archives never load fully into memory. No ZIP64.
- `.gz`: platform `DecompressionStream`.
- Strava archive: `activities.csv` provides names and sport types, matched by `Filename`.
- Health Connect (Android): `lib/health.js` reads workouts through `capacitor-health`;
  `healthTasks` keeps the sports Allure has and `fromHealthWorkout` matches each
  route point to the nearest heart rate sample (≤ 10 s); without a route it returns samples.
- Indoor files and workouts (no GPS): parsers return `samples` instead of `points`, and
  `indoorActivity` builds a track-less meta (time, distance, HR, power), stored with no points. Both feed `importTasks`, like files.
  `readRestingHr` goes through the local `RestingHr` plugin (`android/app/.../RestingHrPlugin.kt`);
  App keeps the result in the `watchRest` setting, used when no resting HR is typed in.

## UI structure

```
src/
  App.jsx        route switch, activity list state, import (progress + summary toast), demo seeding
  recording.js   useRecording(): live recording state, GPS watch, wake lock, autosave (held by App)
  router.js      useRoute() / go(), view transitions, scroll restoration
  pages/         one component per route
  components/    reusable UI (TabBar, ActivityCard, RoutePreview, StatsGrid, TrackMap,
                 ProfileChart, SplitsTable, BestEfforts, ImportButton, ConfirmButton,
                 Segmented, WeeklyChart, ActivityCalendar, RecordsList, LiveMap, HrZones, FitnessChart, RacePredictions,
                 SegmentEfforts, ErrorBoundary, Intervals, Gear)
  lib/           pure logic (analyze, gap, records, stats, sports, format, activity, demo, recorder, training,
                 segments, heatmap, intervals, gear)
                 + platform modules (db, share, story, location, elevation, formats/)
```

- **Chart ↔ map sync**: `ActivityPage` owns a `hover` ref. `TrackMap` assigns
  `hover.current = (index) => moveCursor(index)`, and `ProfileChart` calls it on
  pointer/touch move. No React state is involved, so scrubbing costs no re-render.
- **Destructive actions** use `ConfirmButton` (second tap within 4 s) rather than
  `window.confirm`, which blocks and looks out of place in a native app.
- **Map gestures**: `cooperativeGestures`: one finger scrolls the page, two fingers move
  the map.
- **Demo data**: `lib/demo.js` follows real loops (one foot, one bike per place) stored
  in `lib/demoRoutes.js`, routed on OSM by `node scripts/demo-routes.mjs` (needs
  network, edit its waypoints to change a loop). Elevation, speed and HR stay synthetic.
- **Live recording**: `lib/recorder.js` is a pure state machine (`addFix`, `tick`,
  `pause`, `resume`, `recover`). Fixes over 30 m accuracy and moves under 3 m are
  dropped. Auto-pause stops the clock after 5 s under the sport's stop speed. A voice cue
  plays at every split (`SPORTS[sport].split`). `useRecording` lives in `App`, so the
  recording keeps going across tabs; after a reload it comes back paused. In dev,
  `?sim=10` (e.g. `http://localhost:5173/?sim=10#/record`) replays a demo run at 10×
  instead of the real GPS.

## Where things will go

- `src/lib/location.js` backed by a native background-location plugin (phase 2)
- `ios/`, `android/`: generated by the native shell (phase 2)
- `server/` or a separate repo: backend (phase 3, see `DECISIONS.md`)
