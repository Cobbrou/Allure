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
| `#/`             | `FeedPage`     |
| `#/activity/:id` | `ActivityPage` |
| `#/record`       | `RecordPage` (placeholder until phase 2) |
| `#/profile`      | `ProfilePage`  |

## Storage (`lib/db.js`)

IndexedDB database `allure`, version 2:

- `activities` (keyPath `id`): **meta** records, small enough to list everything at once
- `tracks` (key = activity id): raw **points** arrays, read only on the detail page

Schema changes bump `VERSION` and add an entry to `MIGRATIONS`, which run in order
inside the upgrade transaction:

| Version | Migration |
|---------|-----------|
| 1 | create `activities` and `tracks` |
| 2 | backfill `bestEfforts` on every meta from its track |

Open connections close on `versionchange`, so a newer tab can upgrade. If an older tab
still blocks the upgrade, `open()` rejects with a "close the other tab" message.

## Data model

```js
// Point: one GPS fix as read from the source
{ lat, lon, ele: number|null, time: msEpoch|null, hr: bpm|null }

// ActivityMeta: stored in `activities`
{
  id, name, sport,       // sport: 'run' | 'ride' | 'hike' | 'walk' | 'swim' (lib/sports.js)
  source,                // 'gpx' (any imported file) | 'demo'
  date,                  // ms epoch (first point, or import time when no timestamps)
  distance, movingTime, avgPace, gain, avgHr,  // summary, same units as analyze()
  preview,               // ≤ 81 [lon, lat] pairs for feed thumbnails
  bestEfforts,           // { '1k': s, '5k': s, … } fastest elapsed time per distance
}

// analyze(points): computed on demand, never stored
{
  track: Point & { dist /* cumulative m */, ele /* smoothed */ }[],
  distance, movingTime, avgPace, gain, avgHr, date,
  splits,                // per km; the detail page uses computeSplits(track, sport.split)
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

## Import (`lib/importer.js`, `lib/formats/`)

- `gpx.js`, `tcx.js`: DOMParser based. TCX input is trimmed, because Strava exports
  start with whitespace before `<?xml`.
- `fit.js`: official `@garmin/fitsdk`. Semicircles are converted to degrees.
- `zip.js`: reads only the central directory and the requested entries via
  `Blob.slice`, so multi-GB Strava archives never load fully into memory. No ZIP64.
- `.gz`: platform `DecompressionStream`.
- Strava archive: `activities.csv` provides names and sport types, matched by `Filename`.

## UI structure

```
src/
  App.jsx        route switch, activity list state, import (progress + summary toast), demo seeding
  router.js      useRoute() / go(), view transitions, scroll restoration
  pages/         one component per route
  components/    reusable UI (TabBar, ActivityCard, RoutePreview, StatsGrid, TrackMap,
                 ProfileChart, SplitsTable, BestEfforts, ImportButton, ConfirmButton,
                 Segmented, WeeklyChart, ActivityCalendar, RecordsList)
  lib/           pure logic (analyze, records, stats, sports, format, activity, demo)
                 + platform modules (db, share, story, formats/)
```

- **Chart ↔ map sync**: `ActivityPage` owns a `hover` ref. `TrackMap` assigns
  `hover.current = (index) => moveCursor(index)`, and `ProfileChart` calls it on
  pointer/touch move. No React state is involved, so scrubbing costs no re-render.
- **Destructive actions** use `ConfirmButton` (second tap within 4 s) rather than
  `window.confirm`, which blocks and looks out of place in a native app.
- **Map gestures**: `cooperativeGestures`: one finger scrolls the page, two fingers move
  the map.

## Where things will go

- `src/lib/recorder.js`: live recording, web Geolocation first, then a native
  background-location plugin (phase 2)
- `ios/`, `android/`: generated by the native shell (phase 2)
- `server/` or a separate repo: backend (phase 3, see `DECISIONS.md`)
