<h1 align="center">▲ Allure</h1>

<p align="center">
  <b>Record, analyze and share your runs, rides and hikes.</b><br>
  An open-source, local-first endurance training app for Android (iOS next).
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue"></a>
  <img alt="Platform: Android + web" src="https://img.shields.io/badge/platform-Android%20%7C%20web-3ddc84">
  <img alt="Status: early development" src="https://img.shields.io/badge/status-early%20development-orange">
</p>

<p align="center">
  <img src="docs/screenshots/feed.png" width="200" alt="Activity feed">
  <img src="docs/screenshots/activity.png" width="200" alt="Activity detail with stats and map">
  <img src="docs/screenshots/record.png" width="200" alt="Live recording">
</p>
<p align="center">
  <img src="docs/screenshots/analysis.png" width="200" alt="Heart-rate zones and splits">
  <img src="docs/screenshots/heatmap.png" width="200" alt="Personal heatmap">
  <img src="docs/screenshots/training.png" width="200" alt="Fitness and power curve">
</p>

Allure aims at the feature set of the big fitness-tracking apps, including what they keep
behind a subscription (segments, route builder, heatmaps, training load, live features),
as free software. Your activities stay on your phone: no account, no server, no tracking.

> **Status:** early development. The features below work today (a few recording ones only
> in the browser so far, as noted), but the app has not been released yet and the data
> format may still change. The interface is in French for now; English comes with i18n
> ([roadmap](docs/ROADMAP.md)).

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Android app](#android-app)
- [Development tips](#development-tips)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Your data](#your-data)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Features

**Record**
- Live GPS recording with auto-pause, a manual lap button and spoken cues at every km
  (or 5 km on a bike)
- Large, high-contrast live screen with a thumb-reachable control dock
- Follow a planned route: distance left, voice alert when you go off route
- Live segments: start and finish detection, time against your record
- Crash-safe autosave of the recording in progress
- Bluetooth heart-rate straps, lock-screen controls and haptics (in Chrome on Android
  today; native versions for the app are in progress)

**Analyze**
- Distance, moving time, pace or speed, elevation, heart rate, grade-adjusted pace (GAP)
- Elevation and heart-rate chart scrubbed by touch, synced with the map
- Splits, best efforts (1 km to marathon), personal records, race predictions
- Heart-rate zones and Relative Effort, intervals from laps or auto-detected efforts
- Cycling power: power curve, Normalized Power, FTP estimate, intensity and TSS
- Matched activities: the same route over time

**Train**
- Fitness and freshness (CTL / ATL / TSB), training log, weekly and yearly totals
- Goals per sport (distance, time, elevation, count) with progress rings
- Gear: shoe and bike mileage with wear alerts

**Maps and routes**
- Route builder snapped to roads and trails, with elevation profile and GPX export
- Suggested loops from your position: distance, flat or hilly, paved or trails, new ground
- Personal heatmap of every activity
- Segments: create them from an activity, every matching effort is ranked

**Share and stay private**
- Story image for social media, GPX export, system share sheet
- Privacy zones hide the start and end of your tracks around home on shared images

**Import**
- `.gpx`, `.tcx`, `.fit` (also gzipped), or a whole Strava bulk-export archive (`.zip`),
  with duplicate detection

See the [roadmap](docs/ROADMAP.md) for what is done and what comes next (accounts and
sync, social feed, clubs, challenges, offline maps).

## Quick start

Requirements: [Node.js](https://nodejs.org) 22 or newer.

```sh
git clone https://github.com/Cobbrou/Allure.git
cd Allure
npm install
npm run dev     # http://localhost:5173
```

Open the app, then either import your own files (button or drag and drop) or, in
**Profil → Données de démo**, generate 20 sample activities.

```sh
npm test        # unit tests (node:test, no framework)
npm run build   # production build in dist/
```

## Android app

The Android app is the same web code inside a [Capacitor](https://capacitorjs.com) shell.
You need [Android Studio](https://developer.android.com/studio), which brings the Android
SDK and Java.

```sh
npm run android        # build the web app and copy it into android/
npm run android:open   # open the project in Android Studio, then Run
```

Run it on a phone in developer mode (USB debugging) or on an emulator. Recording with the
screen off needs a background-location plugin that is not wired yet
([decisions](docs/DECISIONS.md)).

## Development tips

- **Simulated GPS:** open `http://localhost:5173/?sim=5#/record` to replay a demo run at
  5× speed instead of using the real GPS (dev builds only).
- **Phone layout:** the app is designed for a ~390 px wide portrait screen. In a desktop
  browser, use the device toolbar of the dev tools.
- **Separate data:** IndexedDB is per origin, so a second dev server
  (`npx vite --port 5174`) starts with an empty database.
- **Tests:** domain logic lives in `src/lib/` as pure functions, each with tests in
  `tests/`.

## Tech stack

| Area | Choice |
|---|---|
| UI | React 18, plain JavaScript, plain CSS (design tokens in `src/styles/global.css`) |
| Build | Vite |
| Maps | MapLibre GL JS with the CARTO Dark Matter basemap |
| Charts | Recharts |
| Storage | IndexedDB, through `src/lib/db.js` only |
| Routing | [BRouter](https://brouter.de) (OpenStreetMap) for the route builder and suggestions |
| Files | Garmin FIT SDK; hand-written GPX, TCX, CSV and ZIP readers |
| Native shell | Capacitor 8 (Android) |
| Tests | `node:test` and `node:assert` |

Why these choices: [docs/DECISIONS.md](docs/DECISIONS.md).

## Project structure

```
src/
  App.jsx            routes, app state, import
  pages/             one screen per route (feed, activity, record, maps, profile…)
  components/        reusable UI (StatMetric, ActivityCard, TrackMap, BottomSheet…)
  lib/               pure domain logic (analysis, records, training, segments, routes…)
                     + platform modules wrapping device APIs (db, location, sensors, share…)
  styles/global.css  design tokens and all styles
tests/               node:test files for src/lib
android/             Capacitor Android project
docs/                roadmap, architecture, decisions, screenshots
```

More detail, including the data model and storage migrations:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Your data

Allure is local-first. Activities, routes, segments and settings live in your browser's or
phone's storage. There is no account, no analytics and no server of ours. The app only
talks to these third-party services:

- **CARTO** basemap tiles and **OpenStreetMap** data, to draw maps
- **BRouter** (`brouter.de`), when you build or request a route
- **Google Fonts**, for the Inter typeface

Uninstalling the app (or clearing the site data) deletes everything, so export what you
want to keep. Cloud sync is on the [roadmap](docs/ROADMAP.md).

## Contributing

Contributions are welcome: bug reports, ideas, code and translations.

1. Open an issue first for anything larger than a small fix, so we can agree on the
   approach.
2. Fork, create a branch, and keep the change focused.
3. Run `npm test` and `npm run build`, and check the screens you touched at phone width.
4. Open a pull request describing what changed and why.

Project conventions:

- **English** for code, comments, docs, commits and PRs. The UI copy stays French until
  i18n lands.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat(maps): add offline tiles`, `fix(record): keep laps after a crash`.
- **Mobile first**: touch targets of at least 44 px, nothing reachable only by hover,
  safe areas respected, every animation covered by `prefers-reduced-motion`.
- **Pure logic in `src/lib/`** with a test for every non-trivial function. Device APIs go
  through the platform modules so they can be swapped for native plugins.
- **SI units internally** (meters, seconds, ms timestamps); convert only for display.
- **No new dependency** when a few lines or a platform API do the job. Discuss it in the
  issue first.
- **Colors** come from the design tokens, never hard-coded in components.

## Acknowledgements

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- Basemap © [CARTO](https://carto.com/attributions)
- Routing by [BRouter](https://github.com/abrensch/brouter); the demo loops were routed
  with the FOSSGIS OSRM server
- Built with [MapLibre GL JS](https://maplibre.org), [React](https://react.dev),
  [Recharts](https://recharts.org), [Capacitor](https://capacitorjs.com) and the
  [Garmin FIT SDK](https://developer.garmin.com/fit/)

Allure is an independent project. It is not affiliated with, endorsed by or connected to
Strava, Garmin or any other fitness company. Strava is a trademark of Strava, Inc.; the
name only appears here to describe file compatibility and inspiration.

## License

Copyright © 2026 Cobbrou.

Allure is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License](LICENSE) as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version.
