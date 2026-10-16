# Decisions

Lightweight decision log. Newest first. Each entry: context, decision, consequences.
Open questions sit at the bottom until decided.

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
- **Native shell** (phase 2). Candidates: Capacitor (wraps this exact web code; leading
  option) vs. React Native (rewrite of the UI layer, more native feel). Must support
  background location, BLE heart-rate straps and MapLibre (MapLibre Native or the
  WebView map).
- **Map tiles in production**: Carto free tier vs. MapTiler / Stadia (paid) vs.
  self-hosted Protomaps (PMTiles).
- **Routing engine** for the route builder: GraphHopper, Valhalla or OSRM (self-hosted
  or hosted API).
- **Monetization**: whether "premium" features stay free or sit behind a subscription.
