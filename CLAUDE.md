# Allure

Strava-inspired web app for recording, analyzing and sharing endurance activities
(run, ride, hike). The project name is **Allure** and stays Allure: never rename it, and
never use Strava's name, logo or branding inside the product.

Long-term goal: feature parity with Strava, including its paid subscription features
(segments, route builder, heatmaps, training load, live tracking…). See `docs/ROADMAP.md`.

## Target platform: mobile app

**Allure is a phone app (iOS + Android).** The web build in this repo is the
development surface: it's fast to iterate in a desktop browser, and the same code will
ship inside a Capacitor native shell (see `docs/DECISIONS.md`).
So:

- Design **mobile-first**: lay out for a ~390 px wide portrait screen first, then let
  it scale up. Check every screen at phone width.
- Touch first: tap targets ≥ 44 px, nothing reachable only by hover or right-click
  (e.g. chart scrubbing must work by touch drag), no reliance on keyboard shortcuts.
- Respect safe areas (`env(safe-area-inset-*)`) and avoid fixed desktop-only layouts.
- Prefer APIs that have a native counterpart (geolocation, storage, share, Bluetooth).
  Wrap them in `src/lib/` so the web implementation can be swapped for a native plugin.
- Desktop browser quirks (mouse wheel zooming the map, drag & drop files) are dev
  conveniences, not product features.

## Language

- **Everything is written in English**: commits, branch names, PR titles/descriptions,
  issues, code identifiers, comments, docs, test names.
- Exception: user-facing UI copy is currently French. Keep UI strings French until i18n
  lands (see roadmap), and do not translate them on your own.
- The owner may talk to you in French; still write all project artifacts in English.

## Commands

```sh
npm install
npm run dev     # Vite dev server on http://localhost:5173
npm run build   # production build to dist/
npm test        # node:test, runs tests/**/*.test.js
npm run android       # build the web app and copy it into the Android project (cap sync)
npm run android:open  # open android/ in Android Studio to run it on a phone or emulator
```

## Stack

React 18 + Vite, MapLibre GL JS (Carto dark-matter style), Recharts 2.
Plain JavaScript (no TypeScript), plain CSS (no framework). No backend yet.
Native shell: Capacitor 8, Android only so far (`android/`, app id `app.allure`). Day to
day development stays in the browser; `npm run android` after web changes to test on a
phone. Don't edit `android/app/src/main/assets/public` (generated). Ask the owner before
adding any npm package or Capacitor plugin.

## Layout

```
src/
  main.jsx          entry point
  App.jsx           route switch, activity list, GPX import, demo seeding
  router.js         hash routing: useRoute() / go()
  theme.js          shared JS constants (accent color, map style URL)
  pages/            one component per route (Feed, Maps, Record, Groups, Profile, Settings, Legal,
                    Activity, Route, TrainingLog, Segment)
  components/       reusable React components, one per file, default export
  lib/              pure logic (analyze, records, stats, sports, format…)
                    + platform modules (db, offline, share, story, importer, formats/, location,
                      sensors, lockscreen, haptics, shell: native-only, loaded in the app)
  styles/global.css design tokens (CSS vars) + all styles
tests/              node:test files for src/lib
docs/               ROADMAP, ARCHITECTURE, DECISIONS
```

Details and data model: `docs/ARCHITECTURE.md`.

## Conventions

- **Commits**: Conventional Commits, in English, imperative mood
  (`feat: add activity history`, `fix(map): load maplibre worker under vite`).
- Keep domain logic in `src/lib/` as pure functions (no React). Browser APIs
  (`DOMParser`, canvas, IndexedDB, Web Share, geolocation, Web Bluetooth, Media Session,
  Vibration) are allowed only in platform modules (`formats/`, `story.js`, `db.js`,
  `share.js`, `location.js`, `sensors.js`, `lockscreen.js`, `haptics.js`, `shell.js`,
  `offline.js`).
  Capacitor plugins are imported dynamically behind `Capacitor.isNativePlatform()`, so
  the browser build never loads them.
- Storage goes through `lib/db.js` only. Changing the IndexedDB schema means bumping
  `VERSION` and adding an entry to `MIGRATIONS` in `db.js`.
- No blocking dialogs (`alert`/`confirm`): use `ConfirmButton` or inline UI.
- Every non-trivial `src/lib` function gets a test in `tests/`. Use `node:test` +
  `node:assert`: no test framework.
- Don't add a dependency when a few lines or a platform API do the job.
- Colors: CSS vars in `styles/global.css`, JS-side constants in `theme.js` (charts, map
  layers, canvas). Accent is `#ff5500` (CTAs, active states, records, main GPS track only),
  background `#0f1115`, cards `#181b22`, borders `#262a34`. No hard-coded colours in
  components: use a token.
- Metrics go through `StatMetric` (label, big value, unit). Digits are tabular app-wide
  (set on `:root`), so live numbers never jump.
- Units internally are SI: meters, seconds, ms epoch timestamps. Convert only for display
  (`lib/format.js`).
- Record decisions with lasting impact in `docs/DECISIONS.md`. Tick roadmap items in
  `docs/ROADMAP.md` when shipped.

## Gotchas

- MapLibre v6 loads its web worker relative to its own module URL, which breaks under
  Vite's dependency pre-bundling. `TrackMap.jsx` fixes it with
  `setWorkerUrl(import 'maplibre-gl/dist/maplibre-gl-worker.mjs?url')`. Keep it.
- Chart hover → map cursor is imperative (`hover` ref), so hovering never re-renders
  React. Don't move that into state.
- The map uses `cooperativeGestures`: wheel scroll passes through, and ctrl+wheel or
  two fingers zoom.
- To check phone layout in a maximized desktop browser, load the app in a 390×844
  `<iframe>`. IndexedDB data is per origin, so it is shared with the main tab.
- The Vite watcher occasionally misses a write done in quick succession (e.g. two
  shell edits), and HMR then serves a stale module. If the browser shows errors for
  code that is fixed on disk, `touch` the file or restart `npm run dev`.
- A tab still running code from before a DB version bump keeps the old connection
  open. The new tab's upgrade then stays blocked until that tab is reloaded or closed.
- Browser screenshots of an iframe taller than the viewport can time out. Keep test
  iframes at ≤ the window height and scroll inside them.

## Motion

- Page transitions live in `router.js` (View Transitions API) + the `Motion` section of
  `global.css`. Detail pages slide, tabs crossfade.
- Entrance animations use `animation-fill-mode: backwards`, never `both`/`forwards`:
  a held final keyframe would override `:active` press transforms.
- Every animation must be covered by the `prefers-reduced-motion` block.
