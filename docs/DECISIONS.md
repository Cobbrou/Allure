# Decisions

Lightweight decision log. Newest first. Each entry: context, decision, consequences.
Open questions sit at the bottom until decided.

## 2026-10-20: Privacy zones are shifted circles with a jittered cut

**Context**: shared tracks were cut exactly where they crossed a circle centred on the
home. Two or three shared stories or GPX files are enough to rebuild that circle and its
centre.
**Decision**: the hidden circle's centre is moved 25 to 50 % of the radius away from the
saved point, in a direction derived from the zone id (FNV-1a hash, `zoneCentre`). Each
track is also cut 0 to 50 % of the radius further along, derived from the zone id and the
track's start. Both are deterministic: sharing the same activity twice gives the same cut,
so repeated shares can't be averaged.
**Consequences**: nothing to migrate (old zones already have an id). The home sits at
least half a radius inside the circle, so the smallest zone (200 m) hides at least 100 m
around it. Someone who knows the zone id could undo the shift, but it never leaves the
phone.

## 2026-10-20: No Android Auto Backup

**Context**: `android:allowBackup="true"` let Android copy the WebView's IndexedDB (GPS
tracks, heart rate) to Google Drive, while the privacy policy says nothing leaves the phone.
**Decision**: `allowBackup="false"`. The in-app backup (Settings → My data) stays the only
way data leaves the device.
**Consequences**: a new phone restored from Google does not bring Allure's activities
back. An automatic backup to Documents (ROADMAP phase 9) would cover that without a
cloud copy.

## 2026-10-20: Theme, accent and map style are settings

**Context**: the owner asked for a light theme, a choice of accent colour and of map style.
The app was dark only, with the accent fixed to `#ff5500`.
**Decision**: the `prefs` setting holds `theme` ('dark' by default, 'light' or 'system'),
`accent` (one of `ACCENTS` in `theme.js`) and `map` ('auto' follows the theme, or a
Carto style: dark-matter, positron, voyager). CSS reads `data-theme` and an inline
`--accent` on `<html>`; JS colours are live bindings in `theme.js` reassigned by
`setTheme()` before render, with the same remount as the units. Every accent offered keeps
dark `--on-accent` text at WCAG AA; on the light theme, accent text uses `--accent-text`
(the accent mixed with black). Story images stay dark (`STORY`). Only Carto styles are
offered: they share the vector tiles, so an offline route map (which now stores the three
styles) works in any of them. Satellite and topographic maps would need a tile provider with
a key or raster tiles, left out for now. In the app shell, Capacitor's built-in
`SystemBars` switches the status bar icons.
**Consequences**: `#ff5500` is the default accent, not the only one. A new colour token
needs a light value too.

## 2026-10-18: Challenges with friends travel as links

**Context**: without accounts, friends still need to see each other's progress on a
shared challenge.
**Decision**: the challenge (rules + every athlete's latest result) is base64url JSON in a
`#/challenge/<code>` link. Opening it joins or merges (newest result per athlete wins);
"Share" sends it back with your live result. The native shell has no public URL, so it
shares a message ending with the bare code, pasted in Groups > Join a challenge. Results
are self-reported, there is no anti-cheat: it's a game between friends.
**Consequences**: standings are only as fresh as the last link received. Links grow with
participants (capped at 50 entries). A real deep link (App Links) needs a hosted domain.

## 2026-10-18: No central social network

**Context**: Strava's community (follow, feed, kudos, comments, clubs) is one of its
subscription arguments. Allure is open source and meant to be self-hosted: an instance
has a handful of users, and a social layer needs accounts, moderation, reports, GDPR
handling and push, all permanent work against the local-first design.
**Decision**: drop follow, home feed, kudos, comments, clubs and activity visibility.
Keep what works without a server: outward sharing (stories, activity files through the
share sheet), challenges with friends as a shared file or link compared locally, group
activity detection from imported tracks. ActivityPub federation stays a far idea, the
only community path that fits self-hosting.
**Consequences**: subscription feature 2 is not covered; parity is claimed without it.
The Groups tab must be rethought around challenges, trophies and sharing.

## 2026-10-18: Recorded altitude comes from the DEM

**Context**: phone GPS altitude is WGS84 ellipsoid height (~50 m above sea level in
France) and noisy, so recorded D+ and profiles were off.
**Decision**: on finish, `lib/elevation.js` replaces the altitude of a recorded track
with the AWS Terrain DEM (terrarium tiles at z12, ~27 m per pixel, bilinear), the source
the 3D map already uses. It waits at most 5 s and skips tracks needing over 64 tiles;
offline or on failure the GPS altitude stays. The draft stays stored meanwhile.
Imported activities keep their altitude: watches often have a barometer.
**Consequences**: finishing a recording does up to ~1 s of network on a good
connection. DEM height is the ground: bridges dip and tunnels follow the hill above.

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
  the app cache with `@capacitor/filesystem` and opens `@capacitor/share`), Web Bluetooth (done: `sensors.js` uses `@capacitor-community/bluetooth-le` in the shell), Media Session
  notifications, and likely `speechSynthesis`. Each sits behind its platform module.
- **Safe areas**: Capacitor 8's SystemBars plugin exposes `--safe-area-inset-*` CSS
  variables on Android; `--safe-top` / `--safe-bottom` read them before `env()`.
- **BLE heart-rate straps**: done with `@capacitor-community/bluetooth-le` (standard
  Heart Rate service: straps, and watches in HR broadcast mode such as Garmin or Polar).
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

## 2026-10-17: Background GPS through @capacitor-community/background-geolocation

**Context**: the WebView's `navigator.geolocation` stops when the screen turns off, so a
native recording loses the track.
**Decision**: in the native shell, `lib/location.watchPosition(…, { background: true })`
uses the community background geolocation plugin (free, MIT, a location foreground
service with a persistent "Enregistrement en cours" notification). Only the recording
watcher asks for it; the GPS warm-up on the setup screen stays on the WebView API.
`android.useLegacyBridge` is on, as the plugin requires, so updates don't stop after
5 minutes in the background.
**Consequences**: Android 13+ hides the notification unless `POST_NOTIFICATIONS` is
granted; asking for it needs another plugin (`@capacitor/local-notifications`), not added
yet. The paid Transistorsoft plugin (motion detection, better battery) stays an option.

## 2026-10-17: Health Connect import through capacitor-health

**Context**: Pixel Watch and Fitbit workouts land in Health Connect, not in files the user
can pick.
**Decision**: `capacitor-health` (MIT, Capacitor 8) reads exercise sessions with their
route and heart rate samples; `@capgo/capacitor-health` has no workout routes. Settings →
Données runs the import on demand. Sessions go through the same `importTasks` path as
files (dedupe by `isDuplicate`, so re-importing is safe). Workouts without a route (treadmill, indoor
bike, pool) come in track-less, like a manual entry plus heart rate (2026-10-20; distance stays
empty: `READ_DISTANCE` is not requested). The app manifest strips the plugin's
unused health permissions (steps, weight, nutrition…) so the consent screen asks for
exercise, route and heart rate only.
**Consequences**: Android `minSdkVersion` goes from 24 to 26 (Health Connect client).
Without `READ_HEALTH_DATA_HISTORY`, Health Connect only returns the 30 days before the
first grant. The plugin has no write method, so Allure activities aren't written back
yet. Its permission rationale screen loads `privacy_policy_url` (the policy source on
GitHub for now), which needs a hosted page before the store release.

## 2026-10-18: Resting heart rate through a local Capacitor plugin

**Context**: HR zones and Relative Effort need resting HR; the watch measures it daily
into Health Connect, but `capacitor-health` can't read `RestingHeartRateRecord`.
**Decision**: a local plugin in the app module (`android/.../RestingHrPlugin.kt`, ~70
lines) reads the last 30 days; `restingFromWatch` takes the median of the last 7. It reuses
the `connect-client` version capacitor-health already ships, so no new npm package. Access
is asked during the Health Connect import; at launch the value only refreshes when access
was already granted. A resting HR typed in Settings still wins. Max HR needs no plugin:
imported watch workouts carry their heart rate, so `estimateMaxHr` already uses them.
**Consequences**: the app module now builds Kotlin (`kotlin-gradle-plugin` 2.2.20 on the
root classpath, same version as capacitor-health). Switching to a health plugin that reads
resting HR would make this plugin redundant.

## 2026-10-17: Display units as module state in format.js

**Context**: imperial units touch ~30 components and the pure lib code that builds labels
(spoken cues, story images, goals). Passing a `units` prop through all of them would be noisy.
**Decision**: `lib/format.js` holds the unit system in a module variable (`setUnits`), and
exposes converters and unit labels (`fmtDist`, `distUnit`, `fmtPaceUnit`…). Storage stays
SI. App calls `setUnits` from the `units` setting during render, and the page tree remounts
when it changes (`ErrorBoundary` key), so components read it during render. Split lengths
are in display units (`SPORTS[sport].split`, see `splitSize`), so imperial runs get mile splits.
**Consequences**: lib code reading the unit is not a pure function of its arguments any
more; tests reset it with `setUnits('metric')`. Named race distances (5 km, 10 km…) and
monthly challenges stay metric, as on the reference app.

## 2026-10-17: i18n with French source strings as keys, no library

**Context**: the UI was French only; the roadmap asks for English + French.
**Decision**: `lib/i18n.js` exposes `t(fr, vars)` and `tn(n, one, many, vars)`. The French
text stays in the code as the key, and `lib/en.js` maps it to English, so the source stays
readable and French needs no dictionary. A `|context` suffix separates identical French
strings that translate differently. The language is module state set by App before render
(same pattern as the units), stored in the `lang` setting, defaulting to the device
language. `tests/i18n.test.js` extracts every `t()` / `tn()` key from `src` and fails on a
missing or unused English entry, or a placeholder mismatch. Legal pages are written out
in both languages rather than split into keys.
**Consequences**: i18next / FormatJS stay unneeded until a third language or complex
plurals. Stored data (default activity names, demo names) keeps the language it was
created in.

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
