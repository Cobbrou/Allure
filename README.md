# Allure

Analyze, record and share your runs and rides. A Strava-inspired **mobile app**
(iOS + Android) with a dark theme.

> The UI is currently developed as a web app for fast iteration in the browser. The
> same code will ship inside a native shell. See [Decisions](docs/DECISIONS.md).

## Features (today)

- Activity feed stored on the device (IndexedDB), with route thumbnails
- Import `.gpx`, `.tcx`, `.fit` (also gzipped) or a full Strava export archive (`.zip`),
  or generate a 20-activity demo history; duplicates are skipped
- GPX export through the system share sheet
- Edit title and sport (run, ride, hike, walk, swim), delete activities
- Route on a dark interactive map
- Distance, moving time, average pace, elevation gain, average heart rate
- Elevation + heart rate chart synced with the map
- Splits per km (5 km for rides, 100 m for swims)
- Profile: totals per week/month/year, 12-week chart, calendar, personal records
- Story PNG export for social media

## Getting started

```sh
npm install
npm run dev     # http://localhost:5173
npm test
```

## Docs

- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md)
