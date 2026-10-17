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
| `#/`             | `FeedPage` (Home tab) |
| `#/activity/:id` | `ActivityPage` |
| `#/record`       | `RecordPage`: setup (sport, auto-pause, voice cues, GPS status), then live recording |
| `#/log`          | `TrainingLogPage`: week-by-week bubbles, opened from the profile |
| `#/segment/:id`  | `SegmentPage`: segment map, distance / grade, your efforts fastest first |
| `#/maps`         | `MapsPage` (tab): personal heatmap, route ideas and route builder (placeholders) |
| `#/groups`       | `GroupsPage` (tab): clubs and events (placeholders until accounts land) |
| `#/profile`      | `ProfilePage`  |

## Storage (`lib/db.js`)

IndexedDB database `allure`, version 5:

- `activities` (keyPath `id`): **meta** records, small enough to list everything at once
- `tracks` (key = activity id): raw **points** arrays, read only on the detail page
- `drafts` (key `current`): the in-progress live recording, autosaved every 5 s
- `settings` (key = setting name): user preferences, e.g. `hr` → `{ max, rest }`,
  `goals` → `[{ id, sport, metric, period, target }]` (see `lib/goals.js`),
  `gear` → `[{ id, name, kind, initial, alert, isDefault, retired }]` (see `lib/gear.js`)
- `segments` (keyPath `id`): user-created segments (see `lib/segments.js`)

Schema changes bump `VERSION` and add an entry to `MIGRATIONS`, which run in order
inside the upgrade transaction:

| Version | Migration |
|---------|-----------|
| 1 | create `activities` and `tracks` |
| 2 | backfill `bestEfforts` on every meta from its track |
| 3 | create `drafts` |
| 4 | create `settings`, backfill `hrTime` on every meta from its track |
| 5 | create `segments` |

Open connections close on `versionchange`, so a newer tab can upgrade. If an older tab
still blocks the upgrade, `open()` rejects with a "close the other tab" message.

## Data model

```js
// Point: one GPS fix as read from the source
{ lat, lon, ele: number|null, time: msEpoch|null, hr: bpm|null }

// ActivityMeta: stored in `activities`
{
  id, name, sport,       // sport: 'run' | 'ride' | 'hike' | 'walk' | 'swim' (lib/sports.js)
  source,                // 'gpx' (any imported file) | 'demo' | 'record'
  date,                  // ms epoch (first point, or import time when no timestamps)
  distance, movingTime, avgPace, gain, avgHr,  // summary, same units as analyze()
  preview,               // ≤ 81 [lon, lat] pairs for feed thumbnails
  bestEfforts,           // { '1k': s, '5k': s, … } fastest elapsed time per distance
  hrTime,                // { [bpm]: s } moving seconds per heart rate (lib/training.js)
  efforts,               // [{ seg, time, from, to }] segment efforts: segment id, elapsed s, point indices
  laps,                  // device lap start times (ms), from FIT / TCX; only when 2+ laps
  gear,                  // gear id (settings `gear`); `saveActivities` sets the sport's default
}

// Segment: stored in `segments`
{ id, name, sport, points /* [lon, lat] every ~10 m */, distance, gain, grade /* avg % */, created }

// analyze(points): computed on demand, never stored
{
  track: Point & { dist /* cumulative m */, ele /* smoothed */, gdist /* grade-adjusted m, with ele */ }[],
  distance, movingTime, avgPace, gain, avgHr, date,
  gap,                   // grade adjusted pace, s/km (lib/gap.js, Minetti cost, downhill halved)
  splits,                // per km, each with pace and gap; the detail page uses computeSplits(track, sport.split)
}
```

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
- **Duplicates on import**: same start second and distance within 10 m (`dupKey`).
- **Profile stats** (`lib/stats.js`): local time, weeks start on Monday.
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
- **Heatmap** (`lib/heatmap.js`): tracks are streamed with `forEachTrack`, thinned to a
  point every 15 m, and drawn as one faint line per activity so overlaps add up. The map
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
                 + platform modules (db, share, story, location, formats/)
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
