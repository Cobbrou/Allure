# Training plans

Plan for adaptive running training plans: the athlete picks a goal, Allure generates a
multi-week program of structured sessions, follows it live, checks what was done and adapts
the rest. Reference product: Runna (bought by Strava in 2025), the leading app for this.
Roadmap entry: phase 10 in `ROADMAP.md`.

Same rule as for Strava: Runna is a reference, never a name, logo, wording or look inside
the product. Feature names below are Allure's own.

## Reference feature set

What Runna offers (2025-2026, from reviews and its press releases), mapped to Allure. The
"Milestone" column points to the delivery plan further down.

| # | Runna feature | Allure equivalent | Milestone |
|---|---|---|---|
| 1 | Plan builder: goal, race date, recent race time, experience, run days, long-run day, plan length | Plan setup wizard, prefilled from history (race predictions, weekly volume) | M3 |
| 2 | Goals: 5K, 10K, half, marathon (+ ultra), "get faster", maintenance | Race plans 5 km → marathon, then "fitness" and maintenance plans; ultra / trail later | M3 / M6 / M7 |
| 3 | New to Running (timed walk-run, 6-16 weeks), Return to Running (4-16 weeks) | Beginner plans with time-based walk / run steps and RPE targets | M6 |
| 4 | Every workout pace set from one estimated race time; update one, all paces move | VDOT-based pace engine, one fitness number drives every target | M1 |
| 5 | Session types: easy, long, recovery, tempo, intervals, fartlek, hills, progression, race pace, strides | Session catalog with step templates per phase | M2 / M3 |
| 6 | Structured workouts with warm-up / cool-down, pace per step, audio guidance | Existing structured workouts, extended with step targets and live "faster / slower" cues | M2 |
| 7 | Weekly view, calendar, today's session | Plan page (weeks), session page, today card on Home and Record | M3 |
| 8 | Drag a session to another day, change the long-run day | Move / swap sessions, change run days mid-plan | M4 |
| 9 | Session auto-completed from the recorded run, plan vs done | Activities matched to sessions, compliance per session and per step | M4 |
| 10 | Post-run feedback (how did it feel) | RPE prompt after a plan session (RPE already exists on activities) | M4 |
| 11 | Pace Insights: proposes new paces when targets are repeatedly beaten or missed | Pace check: proposes a fitness change after several key sessions, user accepts | M5 |
| 12 | Not Feeling 100%: 3-14 days of easy-only / shorter / no running, then return slow / balanced / fast | "Pas en forme" mode: same options, rewrites the window and the ramp back | M5 |
| 13 | Mileage Insights: how closely you stick to volume, proposes sustainable changes | Volume check: planned vs done over 3-4 weeks, proposes a lighter progression | M5 |
| 14 | Adapt for Heat: pace targets eased with forecast temperature and humidity | Heat adjustment from the Open-Meteo forecast (no key) | M7 |
| 15 | Workout Briefings: what the session is for and what to focus on | Briefing text per session type and phase, from templates (no LLM) | M7 |
| 16 | Strength, mobility, warm-up routines | Strength sessions in the plan, reusing the phase 8 strength workouts | M7 |
| 17 | Race-day guidance, predicted time | Race page: predicted time, pacing (even splits), taper notes | M7 |
| 18 | One-off workouts library | Workout library usable outside a plan | M2 |
| 19 | Sync workouts to Garmin / Apple Watch / COROS | FIT workout file export first, partner APIs in phase 6 | M7 |
| 20 | Plan Replay (end-of-plan recap) | Plan recap story (shares the year-in-sport recap renderer) | M7 |
| 21 | Reminders | Local notification the morning of a session (plugin to approve) | M7 |

Out of scope: human coaches and chat, a central community, nutrition content, LLM-written
plans (plans must be explainable and testable, see "Design principles").

## What Allure already has

The plan builds on existing pieces, not beside them:

- `lib/workout.js`: structured workouts (warm-up, N × work / rest, cool-down), each step a
  lap, live step status and spoken cues. Only one template (`prefs.workout`), no pace target.
- `components/WorkoutEditor.jsx`, Record setup "Séance" pill, live step chip in `RecordPage`.
- `lib/records.js`: `bestEfforts`, `personalRecords`, `predictRaces` (Riegel, last 90 days).
- `lib/training.js`: HR zones, Relative Effort, session RPE effort, Fitness & Freshness
  (`fitnessSeries`: CTL / ATL / TSB).
- `lib/stats.js`: `weeklyDistance`, `trainingWeeks`, `startOfWeek` (Monday / Sunday setting).
- `lib/intervals.js`: `lapIntervals` gives pace / HR per lap, so per-step "plan vs done" is
  already computable from a recorded workout.
- `rpe` on activity metas, Training log page, goals, `ConfirmButton`, `BottomSheet`, i18n.

## Design principles

- **Pure and testable**: generation, paces, matching and adaptation are pure functions in
  `src/lib/`, fed with metas and settings, tested with `node:test`. Same inputs, same plan.
- **Rule-based, explainable**: every number comes from a published method (Daniels VDOT,
  10 % rule, 80/20 intensity split). Each adaptation is a proposal the athlete accepts.
- **Local-first**: no backend. The plan lives in IndexedDB and in backups.
- **Never overload**: volume grows at most 10 % a week, a lighter week every 3-4 weeks, no
  two hard days in a row, missed sessions are never crammed into the next days.
- **Mobile-first**: the plan is read on a phone, the session starts in two taps from Home.

## Pace engine (M1)

New `lib/paces.js` (pure):

- `vdot(distance, time)`: Daniels-Gilbert. Oxygen cost of speed `v` (m/min):
  `VO2 = -4.60 + 0.182258 v + 0.000104 v²`; share of VO2max sustainable for `t` minutes:
  `%max = 0.8 + 0.1894393 e^(-0.012778 t) + 0.2989558 e^(-0.1932605 t)`; `VDOT = VO2 / %max`.
- `raceTime(vdot, distance)`: inverse, by bisection on time.
- `trainingPaces(vdot)`: s/km ranges for easy, marathon, threshold, interval, repetition
  (speed whose VO2 is a fixed share of VDOT: easy ~65-74 %, threshold ~88 %, interval
  ~98 %; marathon from `raceTime(vdot, 42195)`; repetition a few s/km faster than interval).
- `currentVdot(metas, now)`: best VDOT from `predictRaces` sources (last 90 days, efforts
  ≥ 3 km preferred), or null. Fallbacks in the wizard: a typed recent race time, then
  "how long can you run without stopping" for beginners (effort-based plan, no paces).
- Tests anchor 3-4 rows of Daniels' published VDOT table (race times and training paces,
  within a few seconds).

Ships the phase 8 item "pace zones for runners without a strap": time in pace zone on an
activity, next to HR zones.

## Workouts with targets (M2)

Extend `lib/workout.js` rather than adding a second model:

- A step gains an optional `target`: `{ pace: [fast, slow] }` (s/km), `{ zone }` (HR zone
  index), or `{ rpe }`. Steps can also be `strides`, `walk`, `run` kinds.
- A workout can be a flat `steps` list (plans, library) or today's template
  (`workoutSteps(template)` stays as is, so `prefs.workout` keeps working).
- Paces are stored as an intensity name (`easy`, `threshold`…), resolved against the plan's
  VDOT when the session starts: a pace change never rewrites stored sessions.
- Live: pace target on the step chip, a spoken / buzzed "plus vite" / "ralentis" when the
  rolling 30 s pace stays outside the range for 20 s (at most every 60 s; GPS pace is noisy).
  Hooks into the existing 1 s timer next to `workoutStep`.
- Activity page: plan vs done per step (target, done pace, HR), from `lapIntervals`.
- Several saved workouts and a small library (fartlek, hills, threshold, VO2, progression,
  strides), startable from Record setup without a plan.

## Plan generator (M3)

New `lib/plan.js` (pure). Split into `planAdapt.js` only if it grows past ~400 lines.

### Inputs (setup wizard)

| Input | Default |
|---|---|
| Goal: 5 km, 10 km, half, marathon; later start running, return to running, fitness | - |
| Race date, or plan length in weeks | race date |
| Optional goal time (shown as "ambitious / realistic", never forces paces) | none |
| Current fitness: VDOT | `currentVdot`, else a recent race time typed in |
| Current weekly volume | average of the last 4 weeks (`weeklyDistance`) |
| Runs per week (2-6) and which days | 3, from history's busiest weekdays |
| Long-run day | Sunday |
| Experience: beginner / intermediate / advanced | from history length and volume |
| Strength sessions per week (0-2) | 0 |
| Start date | next Monday (or week start setting) |

The wizard is one screen per question (bottom-sheet style, large tap targets) ending on a
preview: phases, peak week, predicted race time, then "Commencer le plan".

### Structure

- **Length**: minimum / default per goal (5-10 km: 6-12 weeks, half: 8-16, marathon:
  12-20). A race date too close gives a shorter plan with a warning; too far adds base weeks.
- **Phases**: base (aerobic volume, strides, hills), build (threshold, intervals), peak
  (race-specific: goal-pace blocks), taper. Taper: marathon 3 weeks, half 2, 10 km / 5 km 1.
- **Weekly volume**: from the current volume up to a peak set by goal and experience,
  +10 % a week at most, every 4th week -20-25 % (every 3rd for beginners), taper -20 / -40 /
  -60 %.
- **Long run**: ≤ 30-35 % of the week, capped per goal (marathon ~32 km and ~3 h, half
  ~20 km, 10 km ~15 km, 5 km ~12 km).
- **Intensity**: ~80 % of time easy. One quality session at 2-3 runs a week, two from 4
  runs. Long run counts as a key session in build / peak for half and marathon.
- **Placement**: long run on its day; quality sessions as far from it and from each other
  as the chosen days allow (never the day after the long run); the rest easy; strides on
  one or two easy runs. Strength on non-quality days.
- **Sessions** come from a catalog of builders per type and phase, e.g. threshold
  `3 × 10 min T / 2 min`, VO2 `5 × 1000 m I / 2 min 30`, marathon long run with M-pace
  blocks, half `3 × 3 km HM / 3 min`. Reps grow across the phase, then drop in taper.
- Every session gets an estimated distance and duration (from paces), for the week totals.

### Data model

Active plan in `settings` under `plan`, finished or abandoned ones in `planHistory`. No new
store, no `VERSION` bump, and backups already carry settings. ~100 sessions with steps is a
few tens of KB.

```js
// settings 'plan'
{
  id, created, goal: { kind: '5k' | '10k' | 'half' | 'marathon' | 'start' | 'return' | 'fitness',
                       date /* race day, ms */, time? /* goal time, s */ },
  inputs,                 // wizard answers, to regenerate
  vdot, vdotHistory: [{ date, vdot, why }],
  sessions: [{
    id, date /* day, ms */, week, phase, type /* 'easy' | 'long' | 'tempo' | 'intervals' | … */,
    steps,                // workout steps, targets as intensity names
    distance, duration,   // estimates
    status?,              // 'skipped' | 'moved' (made up on another day); done is computed
    from?,                // id of the missed session this one makes up for
    activity?,            // id linked by hand; null: unlinked by hand, never auto-matched
  }],
  adjustments: [{ kind: 'unwell' | 'volume' | 'pace', from, to, options }],
}
```

The generated sessions are stored, not regenerated on each read: an app update changing
the generator must not reshuffle a plan half way. Regeneration only happens on request
(change of race date, days, pace accepted) and only touches future sessions. To record in
`DECISIONS.md` when shipped.

### Screens

The Home tab becomes the training hub (decided 2026-10-21, see `DECISIONS.md`): without a
social feed, a list of your own activities is not a home screen. The activity list moves
under Profile.

- `#/` (Home tab, label "Entraînement"): today's session (type, steps, paces, start
  button), the week strip (planned / done / missed per day), plan progress (phase, week
  n / N, volume planned vs done), adaptation proposals (M5), race countdown. No plan: goal
  picker, workout library (M2), and the import button so history prefills the wizard.
- `#/plan`: every week of the plan, past weeks done / missed, future weeks; phase bar.
- `#/plan/new`: wizard. `#/plan/session/:id`: steps with paces, briefing, start, move, skip.
- `#/activities`: today's `FeedPage` (cards, paging, pull to refresh, import, demo), opened
  from the Profile header ("N activités") and a "Mes activités" row. Activity pages opened
  from it highlight the Profile tab.
- Record setup: today's session preselected in the "Séance" pill.

## Completion and feedback (M4)

- `matchSessions(plan, metas)` (pure, computed on read, nothing stored): each run is matched
  to the unmatched session of the same day, else ±1 day, by closest type and duration. A
  manual link / unlink is stored on the session.
- Compliance: duration or distance within ±20 % = done; per-step pace hit rate for quality
  sessions (laps of the recorded workout).
- After a plan session ends: RPE prompt (existing field) with one tap.
- Missed session: marked missed, not moved forward automatically. A missed key session can
  replace the next easy run of the week, once.
- Move a session to another day of the week, swap two days, change the run days for the
  rest of the plan (regenerates future weeks).

## Adaptation (M5)

All are proposals in a card on the plan page, accepted or dismissed.

- **Pace check**: after each key session, compare done vs target on work steps. Three key
  sessions in a row faster by > 2 % at RPE ≤ 7 (or HR under the zone) → propose VDOT +1.
  Two missed by > 3 % or RPE ≥ 9 → propose -1. A better `currentVdot` (new race, best effort)
  → propose it. Accepting rewrites future targets only (they are intensity names, see M2).
- **Not feeling well** ("Pas en forme"): from today, 3-14 days; easy only / shorter (-40 %) /
  no running; drop strength or not; return slow / balanced / fast (1-2 weeks of ramp at
  70-90 % volume). Rewrites the window, may push the peak back if the race date allows.
- **Volume check**: done vs planned over the last 3-4 weeks. Under 75 % → propose holding the
  volume for a week instead of growing. Above 115 % → warn (injury risk), no extra volume.
- **Regenerate from today**: same goal, current VDOT and recent volume, past kept.
- Fitness & Freshness (TSB) shown on the plan page; a very negative form before a key
  session adds a hint, never an automatic change.

## Beginner and non-race plans (M6)

Shipped in `lib/plan.js` as `PROGRAMS` (goal kinds `start`, `return`, `fitness`, no race:
`goal.date` is the last day, null when open-ended).

- **Start running**: 6-16 weeks, 2-4 sessions a week, a walk / run ladder (`LADDER`, 8 × 1 min
  run / 1 min 30 walk → 30 min non-stop) spread over the weeks from the rung the athlete
  reaches ("how long can you run non-stop?"). 5 min walks around; run RPE 3, walk RPE 2, no
  paces. Time only: the switch to distance once continuous is left for later.
- **Return to running**: asks the break length (< 1 month, 1-3, > 3 months: restart at 60 /
  40 / 25 % of the old weekly volume) and injury (a quarter lower, +5 % a week, a lighter week
  every 3rd); grows back to the old volume, 4-16 weeks. Easy and long runs by RPE (the old
  paces are too fast), strides in the last 2 weeks unless injured.
- **Fitness / maintenance**: open-ended, 4-week blocks (3 steady, 1 at -20 %) at the current
  volume, hills / fartlek blocks and intervals / threshold blocks in turn; `extendPlan` adds
  a block once the athlete reaches the second-to-last week (App, on load).
- Effort-based targets everywhere a VDOT is missing: `startWorkout` turns a pace target into
  an RPE (`INTENSITY_RPE`). HR zone targets are left for later.
- Adaptation: no pace check on effort programs, no volume check on start running, no
  hold on fitness; no "not feeling well" on start running (skip sessions instead), no
  regenerate outside race plans.

## Extras (M7)

Shipped as below, except strength and mobility (waits for the phase 8 strength workouts) and
treadmill / ultra / trail. Notes: heat uses the summed temperature + dew point (°F) table,
0 to 10 %, fetched on demand for the athlete's usual run hour at the last run's start (rounded
to 0.1°), and stored on the session as `heat` (startWorkout slows the ranges). The FIT file is
written with `@garmin/fitsdk`'s Encoder, already used to read FIT files: flat steps, speed
targets, RPE in the step name. Reminders: `plan.reminder` (hour), the next 14 days scheduled
again whenever the plan or the activities change.

- **Briefings**: per session type and phase, why this session and what to focus on, from
  French templates in `t()` with the session's numbers.
- **Heat adjustment**: Open-Meteo forecast for the session time (no key, network: platform
  module `lib/weather.js`, shared with the phase 7 "weather at the start" item); pace eased
  by temperature and dew point (published heat-pace tables), shown and accepted per session.
- **Race page**: predicted time vs goal, even-split pacing per km, last-week notes. The race
  day session links to the recorded race and a PR check.
- **Strength and mobility**: sessions from the phase 8 strength workouts (bodyweight runner
  routines), placed on easy days.
- **Plan recap**: end-of-plan story (volume, sessions done, VDOT before / after, race
  result), with the year-in-sport recap renderer in `story.js`.
- **Watch export**: a planned session as a FIT workout file (check `@garmin/fitsdk`'s
  encoder before anything else), shared through the share sheet; partner APIs in phase 6.
- **Reminders**: the morning of a session (local notifications plugin: agreed in principle,
  pick and approve the package at M7).
- **Treadmill**: session run indoors once phase 7 indoor recording exists.
- **Later**: ultra and trail (D+ and time-on-feet targets), cycling plans from FTP
  (`lib/power.js`).

## Delivery plan

Each milestone ships on its own and is usable. Order follows dependencies.

| Milestone | Content | Main files |
|---|---|---|
| M0 Activities under Profile | `#/activities` page (today's feed), Profile entry, tab highlighting | `App.jsx`, `TabBar.jsx`, `ProfilePage.jsx`, `FeedPage.jsx` |
| M1 Pace engine | VDOT, training paces, current fitness from history, pace zones on activities | `lib/paces.js`, `tests/paces.test.js`, `ActivityPage` |
| M2 Workouts with targets | step targets, live pace cues, plan vs done per step, saved workouts, library | `lib/workout.js`, `WorkoutEditor`, `RecordPage`, `ActivityPage` |
| M3 Plan generator | wizard, 5 km → marathon plans, storage, Home hub, plan / session pages | `lib/plan.js`, `pages/HomePage.jsx`, `pages/PlanPage.jsx`, `pages/PlanSetupPage.jsx`, `router.js` |
| M4 Completion | matching, compliance, RPE prompt, missed / move / swap | `lib/plan.js`, `PlanPage`, `RecordPage` |
| M5 Adaptation | pace check, not feeling well, volume check, regenerate | `lib/planAdapt.js`, `PlanPage` |
| M6 Beginners ✅ | start / return to running, fitness plans, effort-based targets | `lib/plan.js`, `PlanSetupPage`, `HomePage` |
| M7 Extras ✅ | briefings, heat, race card, recap, FIT export, reminders (strength later) | `lib/briefing.js`, `lib/weather.js`, `lib/reminders.js`, `story.js`, `formats/fitWorkout.js` |

Per milestone: tests for every new `src/lib` function, French UI strings in `t()` with their
`lib/en.js` entry, phone-width check, `ARCHITECTURE.md` (routes, settings keys) and
`ROADMAP.md` ticked.

## Safety and legal

- A plan is general guidance, not medical advice: one line in the wizard and in the terms
  (`LegalPage.jsx`, both languages). Pain or illness → "Pas en forme", not pushing through.
- Hard limits in code, tested: weekly growth ≤ 10 %, long run caps, no back-to-back hard
  days, no pace faster than the current VDOT allows unless the athlete accepted it.

## Decisions (2026-10-21)

- **Entry point**: the Home tab becomes the training hub; the activity list moves under
  Profile (`#/activities`). Done first, as M0, so M3 lands on a free Home tab.
- **Sports**: running only. Cycling plans (FTP) stay a later idea, not planned.
- **Dependencies**: none until M7. A local notifications plugin for reminders is agreed in
  principle; the package is chosen and approved when M7 starts.
