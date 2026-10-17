# Decisions

Lightweight decision log. Newest first. Each entry: context, decision, consequences.
Open questions sit at the bottom until decided.

## 2026-10-17: Native shell is Capacitor

**Context**: Allure ships as an iOS + Android app. The UI and all domain logic are web
code (React + plain JS in `src/lib/`), already split from platform APIs (`location.js`,
`db.js`, `share.js`). The candidates were Capacitor (wrap this code) and React Native
(rewrite the UI layer).
**Decision**: Capacitor. The hard part of a sports app is reliable recording, and that
needs native plugins with either option. Capacitor keeps the whole UI and the fast
browser dev loop, and MapLibre GL JS, the View Transitions and hash routing all work in
the iOS and Android WebViews. Shell setup itself is deferred while web features land.
**Consequences**: before a store release, these platform modules must get native
backends:
- **Background GPS** (blocking): `navigator.geolocation` stops when the app is
  backgrounded or the screen is off. Back `watchPosition` in `location.js` with
  `@capacitor-community/background-geolocation` (free) or Transistorsoft (paid, more
  robust against Android OEM battery savers). Validate on a real phone first.
- **Voice cues**: `speechSynthesis` may be suspended in a backgrounded iOS WebView. Back
  `speak()` with `@capacitor-community/text-to-speech`. The screen Wake Lock becomes
  unnecessary.
- **Storage durability**: WebView IndexedDB can be evicted under storage pressure, and
  activities only live on the device until sync ships. Move `db.js` to
  `@capacitor-community/sqlite`, or ship server sync (phase 3) first.
- **Android back button**: listen to `@capacitor/app` `backButton` and call
  `history.back()`.
- **BLE heart-rate straps**: `@capacitor-community/bluetooth-le`.
- **Startup cost**: on-device JS is parsed at launch, so pages using MapLibre or Recharts
  and the FIT SDK load as lazy chunks (main chunk ~230 kB instead of 2.1 MB).

## 2026-10-16: FIT parsing with `@garmin/fitsdk`; hand-written ZIP, CSV and TCX

**Context**: phase 1 imports FIT, TCX, gzip and Strava bulk archives.
**Decision**: FIT is a complex binary profile, so use Garmin's official SDK. ZIP (stored
and deflate), CSV and TCX each take a few dozen lines on top of platform APIs
(`Blob.slice`, `DecompressionStream`, `DOMParser`), so no dependency for them.
**Consequences**: one new dependency. The ZIP reader has no ZIP64, so archives over
4 GB fail with a clear message.

## 2026-10-16: Motion with the View Transitions API and CSS only

**Context**: navigation felt abrupt. The app must feel native once wrapped.
**Decision**: page transitions use `document.startViewTransition` (Chrome/Android
WebView, Safari 18+), and the other motion is plain CSS. No animation library.
Everything is disabled under `prefers-reduced-motion`.
**Consequences**: older WebViews fall back to instant navigation. Edge-swipe back and
haptics wait for the native shell.

## 2026-10-16: Allure is a mobile app; the web build is the dev surface

**Context**: the product is used outdoors with a phone: recording runs needs reliable
background GPS, Bluetooth sensors and notifications. Iterating in a desktop browser is
much faster than on-device builds.
**Decision**: target iOS + Android. Build the UI with web tech (React), develop it in
the browser, and ship it inside a native shell. Design everything mobile-first and
touch-first. Platform features go behind `src/lib/` modules that can be backed by
native plugins.
**Consequences**: native work starts with phase 2 (live recording). Desktop-only
interactions (hover-only UI, file drag & drop) are dev conveniences, never the only
way to do something.

## 2026-10-16: Project layout: `components/`, `lib/`, `styles/`

**Context**: v0 grew from a single file to a dashboard with several widgets.
**Decision**: React components in `src/components/` (one per file), pure logic in
`src/lib/`, a single global stylesheet with CSS variables. Tests use `node:test` in
`tests/`. No `pages/`, `hooks/` or `store/` folders until a feature needs them.
**Consequences**: logic is testable in Node without a browser. Add folders as phases
require them (see `ARCHITECTURE.md`).

## 2026-10-16: Client-only v0, JavaScript, no UI framework

**Context**: need something runnable immediately to iterate on analysis features.
**Decision**: Vite + React 18 + plain JS + plain CSS. MapLibre GL for maps (open source,
no API key). Recharts 2 for charts. The story PNG is drawn on a `<canvas>` (no
html-to-image dependency).
**Consequences**: zero infra. Moving to TypeScript stays possible later; revisit
when the backend lands.

## 2026-10-16: MapLibre worker URL set explicitly

**Context**: MapLibre v6 resolves its worker via `import.meta.url`, which points into
Vite's pre-bundled deps folder where the worker file does not exist. Result: a black map.
**Decision**: import `maplibre-gl/dist/maplibre-gl-worker.mjs?url` and pass it to
`setWorkerUrl`.
**Consequences**: works in dev and production builds. Re-check after MapLibre upgrades.

## Open questions

- **Backend stack** (phase 3). Candidates: Supabase (Postgres + PostGIS + auth, fastest
  start) vs. a custom Node API + Postgres/PostGIS (full control). PostGIS is needed
  either way for segments, heatmaps and route matching.
- **Map tiles in production**: Carto free tier vs. MapTiler / Stadia (paid) vs.
  self-hosted Protomaps (PMTiles).
- **Routing engine** for the route builder: GraphHopper, Valhalla or OSRM (self-hosted
  or hosted API).
- **Monetization**: whether "premium" features stay free or sit behind a subscription.
