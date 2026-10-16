# Allure

Strava-inspired web app for recording, analyzing and sharing endurance activities
(run, ride, hike). The project name is **Allure** and stays Allure: never rename it, and
never use Strava's name, logo or branding inside the product.

Long-term goal: feature parity with Strava, including its paid subscription features
(segments, route builder, heatmaps, training load, live tracking…). See `docs/ROADMAP.md`.

## Target platform: mobile app

**Allure is a phone app (iOS + Android).** The web build in this repo is the
development surface: it's fast to iterate in a desktop browser, and the same code will
ship inside a native shell (Capacitor is the leading option, see `docs/DECISIONS.md`).
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
```

## Stack

React 18 + Vite, MapLibre GL JS (Carto dark-matter style), Recharts 2.
Plain JavaScript (no TypeScript), plain CSS (no framework). No backend yet.
No native shell yet: the app runs in the browser during development.

## Layout

```
src/
  main.jsx          entry point
  App.jsx           route switch, activity list, GPX import, demo seeding
  router.js         hash routing: useRoute() / go()
  theme.js          shared JS constants (accent color, map style URL)
  pages/            one component per route (Feed, Activity, Record, Profile)
  components/       reusable React components, one per file, default export
  lib/              pure logic (analyze, sports, format…) + platform modules (db, gpx, story)
  styles/global.css design tokens (CSS vars) + all styles
tests/              node:test files for src/lib
docs/               ROADMAP, ARCHITECTURE, DECISIONS
```

Details and data model: `docs/ARCHITECTURE.md`.

## Conventions

- **Commits**: Conventional Commits, in English, imperative mood
  (`feat: add activity history`, `fix(map): load maplibre worker under vite`).
- Keep domain logic in `src/lib/` as pure functions (no React). Browser APIs
  (`DOMParser`, canvas, IndexedDB) are allowed only in platform modules (`gpx.js`,
  `story.js`, `db.js`).
- Storage goes through `lib/db.js` only. Changing the IndexedDB schema means bumping
  `VERSION` with a migration.
- No blocking dialogs (`alert`/`confirm`): use `ConfirmButton` or inline UI.
- Every non-trivial `src/lib` function gets a test in `tests/`. Use `node:test` +
  `node:assert`: no test framework.
- Don't add a dependency when a few lines or a platform API do the job.
- Colors: CSS vars in `styles/global.css`, JS-side constants in `theme.js`. Accent is
  `#fc4c02`, background `#0f172a`.
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
