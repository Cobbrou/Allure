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
| 3 | *Ayez l'esprit tranquille grâce à des fonctionnalités de sécurité* (peace of mind with safety features) | Live location sharing (Beacon-like), privacy zones, emergency contacts | 3 / 5 | Partly done (privacy zones on shared stories, emergency contacts, stillness check-in with an SMS alert, SOS button; live sharing needs accounts) |
| 4 | *Essayez des itinéraires créés rien que pour vous* (routes made for you) | Suggested routes from popular segments and personal preferences | 5 | Partly done (loops ranked on distance, terrain, surface, novelty vs your heatmap; global popularity needs accounts) |
| 5 | *Enregistrez des itinéraires pour les utiliser hors ligne* (save routes for offline use) | Offline routes + offline map tiles | 5 | Done (corridor of vector tiles + style, sprite, glyphs in Cache Storage, per route) |
| 6 | *Tracez vos propres itinéraires* (draw your own routes) | Route builder with road/trail snapping and elevation profile | 5 | Done (public BRouter server) |
| 7 | *Consultez votre historique d'entraînement à un seul et même endroit* (all your training history in one place) | Feed, profile totals, calendar, training log | 1 / 5 | Done |
| 8 | *Analysez vos entraînements grâce à des statistiques avancées* (advanced stats) | HR zones, GAP, intervals, matched activities, predictions, power | 5 | Done (splits, best efforts, HR zones, GAP, race predictions, matched activities, intervals, power) |
| 9 | *Définissez des objectifs personnalisés et suivez vos progrès* (custom goals and progress) | Weekly / monthly / yearly goals per sport, progress rings | 5 | Done (in-app toast when reached; push notifications in phase 6) |
| 10 | *Mesurez-vous aux autres dans les classements sur les segments* (segment leaderboards) | Segments, auto-matching, leaderboards, live segments | 5 | Partly done (segments and personal efforts ranking; shared leaderboards need accounts) |
| 11 | *Rejoignez et créez des challenges avec des amis* (join and create challenges with friends) | Platform challenges + user-created group challenges | 4 / 5 | Partly done (monthly challenges and badges, local; challenges with friends need accounts) |
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
- [x] App shell with bottom tab bar (Home · Maps · Record · Groups · Profile)
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
- [x] Animated route drawing on the detail map
- [x] Stat count-up on the detail page
- [x] Edge swipe to go back (iOS-style), pull to refresh on the feed
- [x] Haptic feedback on key actions (Vibration API on Android; native haptics plugin for
      iOS with the shell)
- [x] Bottom sheets for edit / share actions
- [x] UI redesign: neutral dark palette, `StatMetric` metrics, feed cards with action bar,
      bento stats, split bars, full-screen live tracker with a thumb dock

## Phase 2: Native app & live recording

*Covers subscription feature 1.*

- [ ] Native shell (Capacitor, see `DECISIONS.md`): iOS + Android builds
      running the web code. Android project set up (Capacitor 8, `app.allure`); first
      device build and the iOS project to do
- [ ] Background location plugin: records with the screen off
      (`@capacitor-community/background-geolocation` wired on Android: foreground-service
      notification, legacy bridge; to verify on a device, iOS later)
- [x] Record screen: start / pause / resume / finish (web `watchPosition` in dev,
      native plugin on device)
- [x] Live stats: time, distance, current & average pace, live map
- [x] Manual lap button (spoken lap time, laps saved with the activity)
- [x] Auto-pause
- [x] Audio cues per km (`speechSynthesis`)
- [x] Screen Wake Lock while recording, crash-safe autosave of the in-progress track
- [x] Bluetooth HR strap (Web Bluetooth: Chrome on Android and desktop; native BLE plugin
      for iOS with the shell)
- [x] Lock-screen / notification controls while recording (Media Session API; a native
      foreground-service notification with the shell)

## Phase 3: Accounts & sync

- [ ] Backend + auth (see `DECISIONS.md`)
- [ ] Sync local activities to the server, multi-device
- [x] Privacy zones hiding start/end near home (subscription feature 3; local for now:
      applied to shared stories)
- [ ] Activity visibility (public / followers / only me), once activities are shared
- [x] Gear tracking (shoe / bike mileage, default gear per sport, wear alert; local
      until accounts land)
- [x] Data export & deletion (local: full JSON backup, restore on another device, erase
      everything; server-side account deletion with the backend)

## Phase 4: Social

*Covers subscription features 2 and 11.*

Sharing
- [x] Story redesign: several templates to pick from after an activity (route only,
      stats card, splits, elevation profile…), live preview, swipe between them
- [x] Story over a photo background: route and stats drawn on top of a photo from
      the activity or the camera roll, Strava-style
- [x] Transparent story background (PNG sticker to lay over a photo in another app)

- [ ] Follow athletes, home feed
- [x] Photos on activities (local: added from the camera roll, gallery on the detail page,
      default story background, included in backups)
- [ ] Kudos, comments on activities
- [ ] Clubs, club feed and leaderboards
- [x] Monthly platform challenges and badges (8 challenges a month derived from your
      activities, trophy case on the Groups tab, toast on completion; local until accounts)
- [x] Achievements ("Succès"): 14 permanent badges, unlike the monthly challenges. Milestones
      (first activity, 50 activities, 100 / 1,000 / 5,000 km, Everest of elevation), streaks
      (7 days, 12 weeks), special efforts (half marathon, marathon, 160 km ride, dawn or
      night start, 3 sports). Derived from local activities (`lib/achievements.js`), so
      retroactive on existing history; unlock toast, gallery on the Profile tab with locked
      badges and progress
- [ ] More achievements: PR-based ones (beat a record N times), yearly totals
- [ ] Group challenges created by users, with friends (distance, time, elevation) **(premium)**
- [ ] Group activities (detect athletes who ran together)

## Phase 5: Premium-equivalent features

*Covers subscription features 3 to 13.*

Analysis & training (features 7, 8, 12, 13)
- [x] Training log: week-by-week view of every activity, sized by effort **(premium)**
- [x] Heart-rate zones and time in zone **(premium)**
- [x] Relative Effort: HR-based training load (e.g. TRIMP), comparable across sports **(premium)**
- [x] Fitness & Freshness: fitness score over time (CTL / ATL / TSB) **(premium)**
- [x] Grade Adjusted Pace (GAP) **(premium)**
- [x] Matched activities (same route, progress over time) **(premium)**
- [x] Race time predictions **(premium)**
- [x] Workout / interval analysis (laps, auto-detected efforts) **(premium)**
- [x] Power curve, FTP, cycling power analysis **(premium)** (power read from FIT / TCX /
      GPX; FTP estimated from the best 20 min, or set by hand in Settings)

Goals (feature 9)
- [x] Custom goals per sport: distance, time, elevation, activity count, per
      week / month / year **(premium)**
- [x] Progress rings on the profile and notifications when a goal is reached **(premium)**
      (in-app toast; push in phase 6)

Segments (feature 10)
- [x] Segments: create from an activity, auto-match on save, segment efforts ranked
      against your own (local; shared segments wait for phase 3)
- [ ] Segment leaderboards (filters: age, weight, friends, clubs) **(premium)**
- [x] Live segments during recording **(premium)** (start / finish detection, time left,
      spoken result vs your record)
- [ ] Local Legends (most efforts in 90 days)

Maps & routes (features 4, 5, 6)
- [x] Route builder: draw, snap to roads/trails, elevation profile **(premium)**
      (tap to add waypoints, drag to move, loop back, GPX export)
- [x] Follow a route while recording: route on the live map, distance left, spoken
      off-route / back-on-route / finished cues
- [x] Suggested routes made for you (distance, elevation, surface, popularity) **(premium)**
      (loops from your position; "popularity" is your own heatmap until accounts bring
      a global one)
- [x] Save routes for offline use: route + map tiles downloaded on the device **(premium)**
      (800 m corridor, z5 to z14, served by a `cached://` MapLibre protocol)
- [x] Personal heatmap **(premium)** (a layer of the full-screen Maps tab)
- [x] Explore map: full-screen map centered on you, routes nearest first in a swipeable
      carousel synced with the map; "roads" surface keeps suggested loops on paved ways
- [ ] Global heatmap (aggregated, anonymized)
- [x] 3D terrain view (activity map and route builder: "3D" button, AWS Terrain Tiles DEM,
      hillshade, 1.5x exaggeration, camera tilted to 60°)

Safety (feature 3)
- [ ] Live location sharing with chosen contacts (Strava calls it "Beacon") **(premium)**
- [x] Emergency contacts and safety check-in when an activity stops unexpectedly
      (5 min still: alarm + "Tout va bien ?", 60 s later the alert SMS with the last position
      opens for the contacts; SOS button on the live screen. Sending without a tap needs a
      native SMS plugin or a backend)

## Phase 6: Store release & integrations

- [ ] App Store + Google Play release (signing, store listings, privacy labels)
      (in-app privacy policy, terms and licenses done in Settings; the stores also want
      the privacy policy at a public URL)
- [ ] Push notifications (kudos, comments, challenges)
- [ ] Apple Watch / Wear OS companion
- [ ] Apple Health sync

Pixel Watch / Google
- [ ] Health Connect (Android, native plugin): import exercise sessions recorded by
      the Pixel Watch (route, heart rate, calories); write Allure activities back
      (import wired via `capacitor-health`: Settings → Données, outdoor sessions with a
      GPS route + heart rate; to verify on a device. Write-back: the plugin can't yet)
- [ ] Google Health API (cloud REST, OAuth): pull Pixel Watch / Fitbit workouts and
      daily metrics (resting HR, sleep) without the native shell
- [x] Use resting HR and max HR from the watch for HR zones and Relative Effort
      (resting: local Health Connect plugin, median of the last 7 days; max: estimated
      from imported watch workouts)
- [ ] Garmin / Coros / Suunto / Polar device sync (partner APIs)
- [ ] Open API + webhooks for third parties

## Phase 7: Audit follow-ups (2026-10-18)

Gaps found in a code review of the local-first app. No item here needs a backend.

Fixes
- [x] Recording cost grows with length: `addFix` copies the whole points array on every
      fix and the draft autosave rewrites every point each 5 s. A 6 h ride at 1 Hz copies
      ~20k points per fix. Append in place (or chunk the draft) so long rides stay cheap
      (draft stored in 500-point chunks, a save writes the last one plus the live state;
      the route and segments are written once. `addFix` still copies the array: it copies
      references only, microseconds at 20k, and keeps the recorder pure)
- [x] Share sheet: the last story template (Splits) could not be selected, the strip
      stopped short of centring it and the picker stayed on the previous one
- [x] Heart rate is lost while standing still: a strap reading is only stored with a GPS
      fix that moved ≥ 3 m or passed the accuracy filter. Keep HR samples on their own
      timeline (stops, tunnels, bad GPS)
      (a heart-rate-only point at the last position every 5 s while no fix is stored)
- [x] Absolute elevation is GPS ellipsoid height (~50 m too high in France): correct it
      with the AWS Terrain DEM already used for 3D, Strava-style "elevation correction"
      (recorded activities, on finish; imports keep their altitude)
- [ ] "Correct elevation" button on an imported activity (same `correctElevation`)
- [x] Moving time uses one 0.5 m/s threshold for every sport: steep hikes and swims read
      as stopped. Make it per sport (like `STOP_SPEED` in the recorder)
      (`SPORTS[sport].moving`: hike and swim 0.2, walk 0.25; DB v8 recomputes them. Live
      auto-pause uses it too and no longer pauses a slow climb between stored points)
- [x] Deleted segments leave their efforts on activity metas (see `db.js`): clean them on
      delete instead of filtering on every read (orphans from earlier deletes stay, filtered out)
- [x] Route following is forward-only: a route run in reverse reads as off route
      (`follow.js`). Detect the direction from the first fixes
      (both ways tracked until one gains 200 m, then that route is kept)
- [x] Feed renders every activity at once: a 1 000-activity Strava archive mounts 1 000
      cards and thumbnails. Render in pages as the user scrolls (30 at a time)
- [x] Route listing loads every route's points (`db.js`): split points from route metas
      like activities and tracks (`routeLegs` store, DB v9)

Activity details
- [x] Elapsed time stored and shown next to moving time
      (computed by `analyze`, shown under moving time when stops add a minute or more;
      not stored on metas until a list needs it)
- [x] Description and private notes on an activity (description exported in GPX `<desc>`,
      notes never leave the app)
- [x] Perceived exertion (1–10) feeding Relative Effort when there is no heart rate
      (session RPE × minutes × 0.45, in Fitness & Freshness and the training log)
- [x] Calories estimate (HR-based, else MET by sport and weight)
      (power when there is some, else distance and climb on foot, MET for rides and swims;
      weight in Settings. Not HR-based: that needs age and sex)
- [x] Crop an activity (trim start / end, e.g. a forgotten stop button)
- [ ] Manual activity entry (no GPS: gym, treadmill, pool) and indoor recording (timer +
      strap, no GPS)
- [ ] More sport types: trail run, e-bike, gravel, virtual ride, ski, workout, yoga…
- [ ] Weather at the start of the activity (Open-Meteo history, no key)

Recording
- [ ] 3-2-1 countdown before the clock starts
- [ ] Custom live data fields (pick the 3–4 metrics shown: HR, lap pace, elevation, time
      of day…)
- [ ] HR zone and elevation gain on the live screen
- [ ] Bluetooth cadence / speed and power sensors (same `sensors.js` path as the HR strap)
- [ ] Audio cue options: every N km or N minutes, choose metrics, HR alerts

Training
- [ ] Structured workouts: build intervals (warm-up, reps, recovery), follow them live
      with spoken / haptic prompts, compare plan vs done
- [ ] Training plans (5 km → marathon) generated from goals and current fitness
- [ ] Weekly streaks and a year-in-sport recap (shareable story)
- [ ] Feed search and filters (sport, date range, distance, name)

Production
- [ ] Self-hosted or paid BRouter: the route builder depends on the public server (rate
      limits, no SLA), like the Carto tiles below

## Cross-cutting

- [x] i18n: English + French (Settings → Langue, device language by default; French
      strings are the keys of `lib/en.js`, legal pages written in both languages)
- [x] Imperial units (Profile → Unités: mi, ft, /mi, mi/h, /100 yd, mile splits and
      spoken cues; named race distances and monthly challenges stay metric)
- [x] Accessibility pass (keyboard navigation of chart and map, contrast)
      (done: elevation/HR chart scrubs with ←/→ and drives the map cursor, maps keyboard-
      pannable with French labels and hints, focus rings. Text on accent fills uses `--on-accent` (the
      background colour, 5.9:1) instead of white (3.2:1, under WCAG AA))
- [ ] Self-hosted or paid map tiles for production. The free Carto basemap has
      usage limits.
- [x] Settings screen (account name, units, recording defaults, HR, permissions, privacy
      zones, emergency contacts, data, about with privacy policy, terms and licenses)
- [x] Error boundary with a friendly fallback screen (a render crash used to blank
      the app)
