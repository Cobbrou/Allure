# Roadmap

Goal: a Strava-class app (free tier + everything in the paid subscription), named Allure.
Items tagged **(premium)** are features Strava keeps behind its subscription.
Allure aims to ship them too.

**Target platform: phone app (iOS + Android).** The UI is built as a web app for
development, then shipped inside a native shell. Every phase is designed and tested
mobile-first.

Phases are ordered by dependency: each one unlocks the next.

## Phase 0: Activity analysis ✅

- [x] GPX import (drag & drop + file picker)
- [x] Demo activity generator (10 km Chamonix loop with elevation + HR)
- [x] Map with glowing route, start/finish markers (MapLibre, Carto dark-matter)
- [x] Key stats: distance, moving time, avg pace, elevation gain, avg HR
- [x] Elevation + HR chart synced with a map cursor
- [x] Per-km splits table
- [x] Social story PNG export

## Phase 1: Mobile UI & history (local-first)

- [ ] Mobile-first layout of the existing screens (phone portrait, safe areas, touch
      scrubbing on the chart)
- [ ] App shell with bottom tab bar (Feed · Record · Profile)
- [ ] Persist activities in IndexedDB
- [ ] Activity list / personal feed, activity detail page (routing)
- [ ] Rename, delete, set sport type (run, ride, hike, walk, swim)
- [ ] Bulk import (several GPX files, Strava bulk export archive)
- [ ] TCX and FIT import
- [ ] GPX export
- [ ] Profile dashboard: weekly/monthly/yearly totals, activity calendar
- [ ] Personal records: best 1 km / 5 km / 10 km / half / marathon
- [ ] Sport-aware stats (speed in km/h for rides, pace for runs)

## Phase 2: Native app & live recording

- [ ] Native shell (Capacitor, pending `DECISIONS.md`): iOS + Android builds
      running the web code
- [ ] Background location plugin: records with the screen off
- [ ] Record screen: start / pause / resume / finish (web `watchPosition` in dev,
      native plugin on device)
- [ ] Live stats: time, distance, current & average pace, live map
- [ ] Auto-pause
- [ ] Audio cues per km (`speechSynthesis`)
- [ ] Screen Wake Lock while recording, crash-safe autosave of the in-progress track
- [ ] Bluetooth HR strap (native BLE plugin)
- [ ] Lock-screen / notification controls while recording

## Phase 3: Accounts & sync

- [ ] Backend + auth (see `DECISIONS.md`)
- [ ] Sync local activities to the server, multi-device
- [ ] Privacy controls: activity visibility, privacy zones hiding start/end near home
- [ ] Gear tracking (shoe / bike mileage)
- [ ] Data export & account deletion

## Phase 4: Social

- [ ] Follow athletes, home feed
- [ ] Kudos, comments, photos on activities
- [ ] Clubs, club feed and leaderboards
- [ ] Monthly challenges and badges
- [ ] Group activities (detect athletes who ran together)

## Phase 5: Premium-equivalent features

Analysis & training
- [ ] Heart-rate zones and time in zone **(premium)**
- [ ] Relative Effort (HR-based training load, e.g. TRIMP) **(premium)**
- [ ] Fitness & Freshness (CTL / ATL / TSB) **(premium)**
- [ ] Training log, weekly volume trends **(premium)**
- [ ] Grade Adjusted Pace (GAP) **(premium)**
- [ ] Matched activities (same route, progress over time) **(premium)**
- [ ] Race time predictions **(premium)**
- [ ] Workout / interval analysis (laps, auto-detected efforts) **(premium)**
- [ ] Goals (distance, time, elevation per week/month/year) **(premium)**
- [ ] Power curve, FTP, cycling power analysis **(premium)**

Segments
- [ ] Segments: create, auto-match on upload, segment efforts
- [ ] Segment leaderboards (filters: age, weight, friends, clubs) **(premium)**
- [ ] Live segments during recording **(premium)**
- [ ] Local Legends (most efforts in 90 days)

Maps & routes
- [ ] Route builder: draw, snap to roads/trails, elevation profile **(premium)**
- [ ] Suggested routes / popular routes from aggregated activities **(premium)**
- [ ] Personal heatmap **(premium)**
- [ ] Global heatmap (aggregated, anonymized)
- [ ] Offline maps **(premium)**
- [ ] 3D terrain view

Safety
- [ ] Live location sharing with chosen contacts (Strava calls it "Beacon") **(premium)**

## Phase 6: Store release & integrations

- [ ] App Store + Google Play release (signing, store listings, privacy labels)
- [ ] Push notifications (kudos, comments, challenges)
- [ ] Apple Watch / Wear OS companion
- [ ] Apple Health / Health Connect sync
- [ ] Garmin / Coros / Suunto / Polar device sync (partner APIs)
- [ ] Open API + webhooks for third parties

## Cross-cutting

- [ ] i18n (UI currently French only): English + French
- [ ] Imperial units
- [ ] Accessibility pass (keyboard navigation of chart and map, contrast)
- [ ] Self-hosted or paid map tiles for production. The free Carto basemap has
      usage limits.
