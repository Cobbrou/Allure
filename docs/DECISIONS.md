# Decisions

Lightweight decision log. Newest first. Each entry: context, decision, consequences.
Open questions sit at the bottom until decided.

## 2026-10-17: Segments are local, efforts live on the activity meta

**Context**: segments are the core of Strava's competitive side, but Allure has no
backend or accounts yet.
**Decision**: segments are created from one of your activities and stored on the
device (`segments` store, DB v5). Efforts are stored on each activity meta
(`efforts`), so leaderboards come from the metas already in memory with no track
loading. Matching runs on save (new activities) and on segment creation (all tracks of
that sport). Effort time is elapsed time from start to end, as on Strava.
**Consequences**: leaderboards are personal ("Mes passages") until accounts and sync
(phase 3) make segments shared. Deleting a segment leaves its efforts on metas as dead
data; readers ignore efforts whose segment no longer exists. Changing an activity's
sport does not re-match it.

## 2026-10-17: Native shell is Capacitor

**Context**: Allure ships as an iOS + Android app. The UI and all domain logic are web
code (React + plain JS in `src/lib/`), already split from platform APIs (`location.js`,
`db.js`, `share.js`). The candidates were Capacitor (wrap this code) and React Native
(rewrite the UI layer).
**Decision**: Capacitor. The hard part of a sports app is reliable recording, and that
needs native plugins with either option. Capacitor keeps the whole UI and the fast
browser dev loop, and MapLibre GL JS, the View Transitions and hash routing all work in
the iOS and Android WebViews. Android project added on 2026-10-17 (Capacitor 8.5,
`app.allure`, `capacitor.config.json`); iOS later.
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
- **Android back button**: done with `@capacitor/app` in `lib/shell.js` (closes an open
  sheet, else `history.back()`, else minimizes the app).
- **Web APIs the Android WebView lacks**: Web Share (done: `share.js` writes the file to
  the app cache with `@capacitor/filesystem` and opens `@capacitor/share`), Web Bluetooth (the strap button hides itself), Media Session
  notifications, and likely `speechSynthesis`. Each sits behind its platform module.
- **Safe areas**: Capacitor 8's SystemBars plugin exposes `--safe-area-inset-*` CSS
  variables on Android; `--safe-top` / `--safe-bottom` read them before `env()`.
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

## 2026-10-17: Web stand-ins for native recording features

**Context**: the native shell is deferred, but HR straps, lock-screen controls and haptics
are part of phase 2.
**Decision**: ship them on web APIs behind platform modules: Web Bluetooth
(`lib/sensors.js`), Media Session with a silent looping audio track (`lib/lockscreen.js`;
browsers only show media controls while audio plays), Vibration API (`lib/haptics.js`).
**Consequences**: Android Chrome gets all three; iOS Safari gets none of them (no Web
Bluetooth, no vibration, limited Media Session). Each module is the seam where a
Capacitor plugin replaces the web version. Background GPS still needs the shell.

## 2026-10-17: UI redesign, neutral dark palette

**Context**: the slate-blue theme competed with the GPS tracks and charts, and metrics
were styled ad hoc per screen.
**Decision**: neutral anthracite palette (`#0f1115` / `#181b22` / `#262a34`), accent
`#ff5500` kept for CTAs, active states, records and the main track. Tabular digits on
`:root`. One `StatMetric` component for every metric. The live tracker hides the tab bar
and puts its controls in a floating bottom dock (Lap / Pause / Finish).
**Consequences**: `color-mix()` derives accent tints (Chrome 111+, Safari 16.2+, fine
for the WebView targets). Charts read their colours from `theme.js`.

## 2026-10-17: Route builder routes through the public BRouter server

**Context**: the route builder needs legs snapped to roads and trails, with elevation,
for both cycling and foot profiles, and there is no backend yet.
**Decision**: fetch each leg (waypoint to waypoint) from `brouter.de` (OpenStreetMap,
free, no API key, CORS enabled, elevation in every point). Profiles: `trekking` for rides,
`hiking-mountain` otherwise. Legs are cached by waypoints + profile and saved with the
route, so editing a saved route only fetches the legs that changed. A failed leg falls
back to a straight line.
**Consequences**: no infra, but a public server with no SLA. Before the store release,
self-host BRouter or move to a hosted engine (GraphHopper, Valhalla); only
`lib/routes.js` changes.

Suggested loops (`lib/suggest.js`) don't use BRouter's round-trip mode: on the public
server it times out (70 s watchdog). They route waypoints placed on a circle through the
start, in 6 directions, resized once when the first try misses the target distance.

## 2026-10-17: Offline maps through a MapLibre protocol + Cache Storage

**Context**: following a saved route must work without a network (subscription feature 5),
and the app runs in a Capacitor WebView where service workers are unreliable (iOS
WKWebView only allows them on app-bound domains).
**Decision**: every map loads its style as `cached://…` (`lib/offline.js`). A MapLibre
`addProtocol` handler answers from Cache Storage first, then the network, and rewrites the
style and TileJSON so sources, sprite, glyphs and tiles go through it too (one tile
subdomain, so cache keys are stable). Downloading a route stores the style, sprite, the
Latin glyph ranges and the vector tiles of an 800 m corridor from z5 to z14, in one cache
per route (`allure-route-<id>`), with a marker entry written last so a cut-off download
doesn't count.
**Consequences**: no service worker, no dependency, and only `lib/offline.js` knows about
caching. Downloaded tiles never refresh until the route is downloaded again. Carto's free
tier forbids bulk caching at scale: moving to self-hosted or paid tiles (open question
below) is required before the store release.

## 2026-10-17: Safety alerts go out as a pre-filled SMS

**Context**: an unanswered check-in (athlete still for 5 min while recording) must reach
emergency contacts, but there is no backend and the web can't send an SMS by itself.
**Decision**: `lib/safety.js` decides when to ask and builds the message (stillness, last
position as an OpenStreetMap link); the page opens an `sms:` link to every contact. The
link opens on its own when the alert fires (the Android WebView hands it to the SMS app),
and stays as a big button. A manual pause never triggers a check-in.
**Consequences**: someone still has to press send in the SMS app, which is weak when the
athlete is hurt. Truly automatic alerts need either a native SMS plugin (Android only) or
the phase 3 backend sending them, which also unlocks live location sharing (Beacon).

## Open questions

- **Backend stack** (phase 3). Candidates: Supabase (Postgres + PostGIS + auth, fastest
  start) vs. a custom Node API + Postgres/PostGIS (full control). PostGIS is needed
  either way for segments, heatmaps and route matching.
- **Map tiles in production**: Carto free tier vs. MapTiler / Stadia (paid) vs.
  self-hosted Protomaps (PMTiles). Same question for the relief (DEM) tiles of the 3D view,
  read from the public AWS Terrain Tiles bucket for now.
- **Routing engine in production**: self-hosted BRouter vs. GraphHopper / Valhalla
  (see the 2026-10-17 entry).
- **Monetization**: whether "premium" features stay free or sit behind a subscription.
