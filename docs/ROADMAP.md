# Roadmap

Goal: a Strava-class app (free tier + everything in the paid subscription), named Allure.
Items tagged **(premium)** are features Strava keeps behind its subscription.
Allure aims to ship them too.

**Target platform: phone app (iOS + Android).** The UI is built as a web app for
development, then shipped inside a native shell. Every phase is designed and tested
mobile-first.

Phases are ordered by dependency: each one unlocks the next.

## Strava subscription parity

The features Strava advertises for its subscription (French list from strava.com),
mapped to where they land in this roadmap. This list is the reference for "premium
parity": every line must be covered before the app can claim it.

| # | Strava subscription feature | Allure equivalent | Phase | Status |
|---|---|---|---|---|
| 1 | *Enregistrez vos activités* (record your activities) | Live GPS recording, auto-pause, audio cues, sensors | 2 | Partly done (web recording; background GPS and sensors need the native shell) |
| 2 | *Rejoignez une communauté d'un grand soutien* (join a supportive community) | Follow, feed, kudos, comments, clubs | 4 | Planned |
| 3 | *Ayez l'esprit tranquille grâce à des fonctionnalités de sécurité* (peace of mind with safety features) | Live location sharing (Beacon-like), privacy zones, emergency contacts | 3 / 5 | Planned |
| 4 | *Essayez des itinéraires créés rien que pour vous* (routes made for you) | Suggested routes from popular segments and personal preferences | 5 | Planned |
| 5 | *Enregistrez des itinéraires pour les utiliser hors ligne* (save routes for offline use) | Offline routes + offline map tiles | 5 | Planned |
| 6 | *Tracez vos propres itinéraires* (draw your own routes) | Route builder with road/trail snapping and elevation profile | 5 | Planned |
| 7 | *Consultez votre historique d'entraînement à un seul et même endroit* (all your training history in one place) | Feed, profile totals, calendar, training log | 1 / 5 | Partly done (feed, totals, calendar). Training log in phase 5 |
| 8 | *Analysez vos entraînements grâce à des statistiques avancées* (advanced stats) | HR zones, GAP, intervals, matched activities, predictions, power | 5 | Partly done (splits, best efforts, HR zones, GAP, race predictions) |
| 9 | *Définissez des objectifs personnalisés et suivez vos progrès* (custom goals and progress) | Weekly / monthly / yearly goals per sport, progress rings | 5 | Planned |
| 10 | *Mesurez-vous aux autres dans les classements sur les segments* (segment leaderboards) | Segments, auto-matching, leaderboards, live segments | 5 | Planned |
| 11 | *Rejoignez et créez des challenges avec des amis* (join and create challenges with friends) | Platform challenges + user-created group challenges | 4 / 5 | Planned |
| 12 | *Mesurez vos efforts dans différentes activités* (measure effort across sports) | Relative Effort: HR-based load comparable across sports | 5 | Done (Banister TRIMP) |
| 13 | *Découvrez votre score de condition physique au fil du temps* (fitness score over time) | Fitness & Freshness (CTL / ATL / TSB) chart | 5 | Done |

## Phase 0: Activity analysis ✅

- [x] GPX import (drag & drop + file picker)
- [x] Demo activity generator (10 km Chamonix loop with elevation + HR)
- [x] Map with glowing route, start/finish markers (MapLibre, Carto dark-matter)
- [x] Key stats: distance, moving time, avg pace, elevation gain, avg HR
- [x] Elevation + HR chart synced with a map cursor
- [x] Per-km splits table
- [x] Social story PNG export

## Phase 1: Mobile UI & history (local-first) ✅

- [x] Mobile-first layout of the existing screens (phone portrait, safe areas, touch
      scrubbing on the chart)
- [x] App shell with bottom tab bar (Feed · Record · Profile)
- [x] Persist activities in IndexedDB (with schema migrations)
- [x] Activity list / personal feed, activity detail page (routing)
- [x] Rename, delete, set sport type (run, ride, hike, walk, swim)
- [x] Demo history generator (20 activities over 60 days) for testing
- [x] Bulk import: multiple files, Strava bulk export archive (.zip + activities.csv)
- [x] TCX, FIT and gzipped (.gz) import, duplicate detection
- [x] GPX export (system share sheet on touch devices)
- [x] Profile dashboard: weekly/monthly/yearly totals, 12-week chart, activity calendar
- [x] Personal records: best 1 km / 5 km / 10 km / half / marathon, PR badges
- [x] Sport-aware stats (speed in km/h for rides, pace for runs)
- [x] Swim pace per 100 m, ride splits per 5 km

Motion & polish
- [x] Page transitions (View Transitions API): slide forward/back for detail pages,
      crossfade between tabs, tab bar pinned
- [x] Feed scroll position restored when coming back from a detail page
- [x] Press feedback on cards, buttons and tabs
- [x] Staggered card entrances, route thumbnails drawn on appear, bars grow in
- [x] Loading skeleton on the detail page, map fades in once tiles are ready
- [x] `prefers-reduced-motion` disables all motion
- [ ] Animated route drawing on the detail map
- [ ] Stat count-up on the detail page
- [ ] Edge swipe to go back (iOS-style), pull to refresh on the feed
- [ ] Haptic feedback on key actions (native shell)
- [ ] Bottom sheets for edit / share actions

## Phase 2: Native app & live recording

*Covers subscription feature 1.*

- [ ] Native shell (Capacitor, pending `DECISIONS.md`): iOS + Android builds
      running the web code
- [ ] Background location plugin: records with the screen off
- [x] Record screen: start / pause / resume / finish (web `watchPosition` in dev,
      native plugin on device)
- [x] Live stats: time, distance, current & average pace, live map
- [x] Auto-pause
- [x] Audio cues per km (`speechSynthesis`)
- [x] Screen Wake Lock while recording, crash-safe autosave of the in-progress track
- [ ] Bluetooth HR strap (native BLE plugin)
- [ ] Lock-screen / notification controls while recording

## Phase 3: Accounts & sync

- [ ] Backend + auth (see `DECISIONS.md`)
- [ ] Sync local activities to the server, multi-device
- [ ] Privacy controls: activity visibility, privacy zones hiding start/end near home
      (subscription feature 3)
- [ ] Gear tracking (shoe / bike mileage)
- [ ] Data export & account deletion

## Phase 4: Social

*Covers subscription features 2 and 11.*

- [ ] Follow athletes, home feed
- [ ] Kudos, comments, photos on activities
- [ ] Clubs, club feed and leaderboards
- [ ] Monthly platform challenges and badges
- [ ] Group challenges created by users, with friends (distance, time, elevation) **(premium)**
- [ ] Group activities (detect athletes who ran together)

## Phase 5: Premium-equivalent features

*Covers subscription features 3 to 13.*

Analysis & training (features 7, 8, 12, 13)
- [ ] Training log: week-by-week view of every activity, sized by effort **(premium)**
- [x] Heart-rate zones and time in zone **(premium)**
- [x] Relative Effort: HR-based training load (e.g. TRIMP), comparable across sports **(premium)**
- [x] Fitness & Freshness: fitness score over time (CTL / ATL / TSB) **(premium)**
- [x] Grade Adjusted Pace (GAP) **(premium)**
- [ ] Matched activities (same route, progress over time) **(premium)**
- [x] Race time predictions **(premium)**
- [ ] Workout / interval analysis (laps, auto-detected efforts) **(premium)**
- [ ] Power curve, FTP, cycling power analysis **(premium)**

Goals (feature 9)
- [ ] Custom goals per sport: distance, time, elevation, activity count, per
      week / month / year **(premium)**
- [ ] Progress rings on the profile and notifications when a goal is reached **(premium)**

Segments (feature 10)
- [ ] Segments: create, auto-match on upload, segment efforts
- [ ] Segment leaderboards (filters: age, weight, friends, clubs) **(premium)**
- [ ] Live segments during recording **(premium)**
- [ ] Local Legends (most efforts in 90 days)

Maps & routes (features 4, 5, 6)
- [ ] Route builder: draw, snap to roads/trails, elevation profile **(premium)**
- [ ] Suggested routes made for you (distance, elevation, surface, popularity) **(premium)**
- [ ] Save routes for offline use: route + map tiles downloaded on the device **(premium)**
- [ ] Personal heatmap **(premium)**
- [ ] Global heatmap (aggregated, anonymized)
- [ ] 3D terrain view

Safety (feature 3)
- [ ] Live location sharing with chosen contacts (Strava calls it "Beacon") **(premium)**
- [ ] Emergency contacts and safety check-in when an activity stops unexpectedly

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
- [ ] Error boundary with a friendly fallback screen (a render crash currently blanks
      the app)
