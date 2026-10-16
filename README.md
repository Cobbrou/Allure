# Allure

Analyze, record and share your runs and rides. A Strava-inspired **mobile app**
(iOS + Android) with a dark theme.

> The UI is currently developed as a web app for fast iteration in the browser. The
> same code will ship inside a native shell. See [Decisions](docs/DECISIONS.md).

## Features (today)

- Activity feed stored on the device (IndexedDB), with route thumbnails
- Import a `.gpx` file, or generate a 20-activity demo history
- Edit title and sport (run, ride, hike, walk, swim), delete activities
- Route on a dark interactive map
- Distance, moving time, average pace, elevation gain, average heart rate
- Elevation + heart rate chart synced with the map
- Per-km splits
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
