// Running training plans: a goal race in, a periodized program of structured sessions out.
// Rule-based so every number can be explained (docs/TRAINING_PLANS.md): volume grows 10 % a
// week at most with a lighter week every 3-4 weeks, the long run is capped, ~80 % of running
// is easy and hard days are never back to back. Sessions are workout step lists (lib/workout.js)
// whose paces are intensity names, resolved against the VDOT when a session starts.

import { t } from './i18n.js';
import { currentVdot, trainingPaces } from './paces.js';
import { startOfDay, startOfWeek, weeklyDistance } from './stats.js';

/**
 * Race goals. weeks: [shortest, default, longest] plan; taper weeks; longCap: longest long
 * run (m); peak: top weekly volume (m) for a beginner, intermediate, advanced runner.
 */
export const GOALS = {
  '5k': { m: 5000, label: '5 km', weeks: [6, 10, 12], taper: 1, longCap: 12000, peak: [30000, 45000, 65000] },
  '10k': { m: 10000, label: '10 km', weeks: [6, 10, 14], taper: 1, longCap: 16000, peak: [35000, 50000, 75000] },
  half: { m: 21097.5, get label() { return t('Semi-marathon'); }, weeks: [8, 12, 16], taper: 2, longCap: 20000, peak: [40000, 55000, 85000] },
  marathon: { m: 42195, label: 'Marathon', weeks: [12, 16, 20], taper: 3, longCap: 32000, peak: [50000, 70000, 100000] },
};

export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'];

export const PHASES = {
  base: { get label() { return t('Fondation'); } },
  build: { get label() { return t('Développement'); } },
  peak: { get label() { return t('Spécifique'); } },
  taper: { get label() { return t('Affûtage'); } },
};

export const SESSION_TYPES = {
  easy: { get label() { return t('Footing'); } },
  long: { get label() { return t('Sortie longue'); } },
  hills: { get label() { return t('Côtes'); } },
  fartlek: { get label() { return t('Fartlek'); } },
  tempo: { get label() { return t('Seuil'); } },
  intervals: { get label() { return t('Fractionné'); } },
  racePace: { get label() { return t('Allure course'); } },
  race: { get label() { return t('Course'); } },
};
const HARD = new Set(['long', 'hills', 'fartlek', 'tempo', 'intervals', 'racePace', 'race']);
export const isHard = (type) => HARD.has(type);

const MAX_GROWTH = 1.1; // weekly volume grows 10 % at most
const RECOVERY = 0.8; // a lighter week every 3rd (beginners) or 4th week
const TAPER = { 1: [0.6], 2: [0.75, 0.5], 3: [0.8, 0.6, 0.4] }; // share of the peak, by taper length
const MIN_RUN = 3000; // m, shortest easy run
const RUN_CAP = 16000; // m a week per run day: 3 runs never get a 100 km peak
const LONG_TIME = 3 * 3600; // s, longest long run
const RACE_WEEK_RUN = 8000; // m, longest run of the race week
const EASY_SHARE = 0.75; // an easy run stays well under the long run, strides included

const addDays = (time, n) => { const d = new Date(time); d.setDate(d.getDate() + n); return d.getTime(); };
const round500 = (m) => Math.round(m / 500) * 500;
/** Days between two weekdays (getDay), around the week: Sunday and Monday are 1 apart. */
const gap = (a, b) => { const d = Math.abs(a - b) % 7; return Math.min(d, 7 - d); };
/** Date of weekday `day` (getDay) in the week starting at `weekStart`. */
const dateIn = (weekStart, day) => addDays(weekStart, (day - new Date(weekStart).getDay() + 7) % 7);

/** Number of weeks from the plan start to the race week, included. */
export const planWeeks = ({ start, raceDate }) => Math.floor(Math.round((startOfDay(raceDate) - start) / 86400e3) / 7) + 1;

/** Default race day: `weeks` weeks of plan from `start`, on the long-run day. */
export const defaultRaceDate = (goal, start, longDay) => dateIn(addDays(start, 7 * (GOALS[goal].weeks[1] - 1)), longDay);

/** Phase of each week: base, build, peak, then the taper weeks. */
export function planPhases(weeks, taper) {
  const n = Math.max(0, weeks - taper);
  const peak = Math.min(n, Math.max(1, Math.round(n * 0.25)));
  const base = Math.round((n - peak) * 0.55);
  return [...Array(base).fill('base'), ...Array(n - peak - base).fill('build'), ...Array(peak).fill('peak'), ...Array(weeks - n).fill('taper')];
}

/**
 * Target volume (m) and kind ('build' | 'recovery' | 'taper') of each week: from the current
 * volume (at least 4 km per run day) up to the peak, +10 % a week at most over the last full
 * week, a lighter week every 3rd / 4th, then the taper as shares of the volume reached.
 */
export function weeklyVolumes({ goal, weekly, runs, experience }, weeks) {
  const g = GOALS[goal], x = Math.max(0, EXPERIENCE.indexOf(experience));
  const every = x === 0 ? 3 : 4;
  const floor = runs * 4000;
  const peak = Math.max(Math.min(g.peak[x], runs * RUN_CAP), floor);
  const taper = TAPER[g.taper];
  let level = Math.floor(Math.min(Math.max(weekly || 0, floor), peak) / 500) * 500;
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const k = w - (weeks - taper.length);
    if (k >= 0) out.push({ volume: round500(level * taper[k]), kind: 'taper' });
    else if ((w + 1) % every === 0 && w < weeks - taper.length - 1) out.push({ volume: round500(level * RECOVERY), kind: 'recovery' });
    else {
      if (w > 0) level = Math.floor(Math.min(level * MAX_GROWTH, peak) / 500) * 500; // rounded down: never over 10 %
      out.push({ volume: level, kind: 'build' });
    }
  }
  return out;
}

/**
 * Days (getDay) of the quality sessions: as far from the long run and from each other as
 * the run days allow, never next to another hard day. May return fewer than `count`.
 */
export function qualityDays(days, longDay, count) {
  const hard = [longDay], out = [];
  for (let k = 0; k < count; k++) {
    let best = null, bestGap = 1;
    for (const d of days) {
      if (hard.includes(d)) continue;
      const g = Math.min(...hard.map((h) => gap(d, h)));
      if (g > bestGap) { best = d; bestGap = g; }
    }
    if (best == null) break;
    hard.push(best);
    out.push(best);
  }
  return out;
}

// Step builders, same shape as lib/workout.js steps.
const step = (kind, type, value, pace) => ({ kind, type, value, ...(pace && { target: { pace } }) });
const warm = (min) => step('warmup', 'time', min * 60, 'easy');
const cool = (min) => step('cooldown', 'time', min * 60, 'easy');
const repeat = (reps, work, rest) => Array.from({ length: reps }, (_, i) => (i < reps - 1 ? [work, rest] : [work])).flat();
const grow = (from, to, r) => Math.round(from + (to - from) * r);

// Race-specific blocks: [reps from, reps to, meters, intensity, rest s].
// ponytail: half-marathon pace has no intensity of its own, threshold stands in (a little faster).
const RACE_PACE = {
  '5k': [4, 6, 1000, 'interval', 120],
  '10k': [3, 4, 2000, 'threshold', 120],
  half: [2, 4, 3000, 'threshold', 180],
  marathon: [2, 3, 5000, 'marathon', 120],
};

/** Steps of a quality session; r (0..1) is the progress through its phase. */
function qualitySteps(type, goal, r) {
  if (type === 'hills') return [warm(15), ...repeat(grow(6, 10, r), step('work', 'time', 60), step('rest', 'time', 90)), cool(10)];
  if (type === 'fartlek') return [warm(10), ...repeat(grow(6, 10, r), step('work', 'time', 60, 'interval'), step('rest', 'time', 60, 'easy')), cool(10)];
  if (type === 'tempo') return [warm(15), ...repeat(grow(2, 4, r), step('work', 'time', 600, 'threshold'), step('rest', 'time', 120, 'easy')), cool(10)];
  if (type === 'intervals') return [warm(15), ...repeat(grow(4, 6, r), step('work', 'dist', 1000, 'interval'), step('rest', 'time', 150)), cool(10)];
  const [from, to, m, pace, rest] = RACE_PACE[goal];
  return [warm(15), ...repeat(grow(from, to, r), step('work', 'dist', m, pace), step('rest', 'time', rest, 'easy')), cool(10)];
}

const mid = ([a, b]) => (a + b) / 2;

/** Estimated { distance, duration } of steps; untargeted steps at the slow end of easy. */
export function estimate(steps, paces) {
  let distance = 0, duration = 0;
  for (const s of steps) {
    const pace = s.target?.pace ? mid(paces[s.target.pace]) : paces.easy[1];
    const d = s.type === 'dist' ? s.value : (s.value / pace) * 1000;
    distance += d;
    duration += s.type === 'time' ? s.value : (s.value / 1000) * pace;
  }
  return { distance: Math.round(distance), duration: Math.round(duration) };
}

/** Quality session types of a week, by phase. */
function qualityTypes(phase, count, week) {
  const one = { base: week % 2 ? 'fartlek' : 'hills', build: week % 2 ? 'tempo' : 'intervals', peak: 'racePace', taper: 'racePace' }[phase];
  if (count < 2) return [one];
  return { base: ['hills', 'fartlek'], build: ['intervals', 'tempo'], peak: ['racePace', 'tempo'], taper: ['racePace'] }[phase];
}

/**
 * The plan for the wizard inputs:
 * { goal, raceDate, start (first day of week 1), vdot, weekly (m, recent average), runs,
 *   days (getDay values), longDay, experience }.
 * Same inputs, same plan. `now` stamps it.
 */
export function generatePlan(inputs, now = Date.now()) {
  const g = GOALS[inputs.goal];
  const paces = trainingPaces(inputs.vdot);
  const weeks = Math.max(g.taper + 1, planWeeks(inputs));
  const phases = planPhases(weeks, g.taper);
  const volumes = weeklyVolumes(inputs, weeks);
  const days = [...new Set([...inputs.days, inputs.longDay])].slice(0, 7);
  const x = Math.max(0, EXPERIENCE.indexOf(inputs.experience));
  const nq = x > 0 && days.length >= 4 ? 2 : 1;
  const longCap = Math.min(g.longCap, round500((LONG_TIME / paces.easy[1]) * 1000));
  const raceDay = startOfDay(inputs.raceDate);
  const sessions = [];
  const add = (date, week, phase, type, steps) => {
    sessions.push({ id: `${week}-${new Date(date).getDay()}`, date, week, phase, type, steps, ...estimate(steps, paces) });
  };

  for (let w = 0; w < weeks; w++) {
    const week = w + 1, phase = phases[w], { volume, kind } = volumes[w];
    const weekStart = addDays(inputs.start, 7 * w);
    const inPhase = phases.indexOf(phase), phaseLen = phases.lastIndexOf(phase) - inPhase + 1;
    const r = kind === 'recovery' || phase === 'taper' ? 0 : phaseLen > 1 ? (w - inPhase) / (phaseLen - 1) : 1;

    if (week === weeks) { // race week: the race, easy runs before it, none the day before
      add(raceDay, week, phase, 'race', [step('work', 'dist', g.m)]);
      const before = days.filter((d) => dateIn(weekStart, d) < addDays(raceDay, -1));
      const easy = before.length && Math.min(RACE_WEEK_RUN, Math.max(MIN_RUN, round500(volume / before.length)));
      before.forEach((d, i) => add(dateIn(weekStart, d), week, phase, 'easy',
        i === 0 ? [step('work', 'dist', easy, 'easy'), ...repeat(4, step('work', 'time', 20, 'repetition'), step('rest', 'time', 60))] : [step('work', 'dist', easy, 'easy')]));
      continue;
    }

    const qDays = qualityDays(days, inputs.longDay, phase === 'taper' ? 1 : nq);
    const types = qualityTypes(phase, qDays.length, w);
    const quality = qDays.map((d, i) => ({ d, type: types[i], steps: qualitySteps(types[i], inputs.goal, r) }));
    const qDist = quality.reduce((s, q) => s + estimate(q.steps, paces).distance, 0);
    const longShare = days.length <= 3 ? 0.35 : 0.3;
    const long = Math.min(longCap, Math.max(MIN_RUN, round500(volume * longShare)));
    const easyDays = days.filter((d) => d !== inputs.longDay && !qDays.includes(d));
    const easy = easyDays.length && Math.min(round500(long * EASY_SHARE), Math.max(MIN_RUN, round500((volume - long - qDist) / easyDays.length)));

    // Goal pace at the end of the long run, in the peak weeks of the long races.
    const goalFinish = phase === 'peak' && (inputs.goal === 'half' || inputs.goal === 'marathon');
    const finish = goalFinish ? round500(long * 0.25) : 0;
    add(dateIn(weekStart, inputs.longDay), week, phase, 'long',
      finish ? [step('work', 'dist', long - finish, 'easy'), step('work', 'dist', finish, 'marathon')] : [step('work', 'dist', long, 'easy')]);
    for (const q of quality) add(dateIn(weekStart, q.d), week, phase, q.type, q.steps);
    easyDays.forEach((d, i) => {
      const strides = i === 0 && (phase === 'base' || phase === 'build');
      add(dateIn(weekStart, d), week, phase, 'easy', strides
        ? [step('work', 'dist', easy, 'easy'), ...repeat(6, step('work', 'time', 20, 'repetition'), step('rest', 'time', 60))]
        : [step('work', 'dist', easy, 'easy')]);
    });
  }
  sessions.sort((a, b) => a.date - b.date);
  return {
    id: String(now),
    created: now,
    goal: { kind: inputs.goal, date: raceDay },
    inputs,
    vdot: inputs.vdot,
    vdotHistory: [{ date: now, vdot: inputs.vdot, why: 'start' }],
    weeks: volumes.map((v, i) => ({ ...v, phase: phases[i] })),
    sessions,
    adjustments: [],
  };
}

/**
 * Wizard defaults from history: fitness, average weekly running volume of the last 4 full
 * weeks, the busiest weekdays, experience; the plan starts next week.
 */
export function planDefaults(metas, now = Date.now()) {
  const fit = currentVdot(metas, now);
  const weekly = Math.round(weeklyDistance(metas, now, 5, 'run').slice(0, 4).reduce((s, w) => s + w.distance, 0) / 4);
  const recent = metas.filter((a) => a.sport === 'run' && a.date > now - 56 * 86400e3 && a.date <= now);
  const count = Array(7).fill(0);
  for (const a of recent) count[new Date(a.date).getDay()]++;
  const busiest = [0, 1, 2, 3, 4, 5, 6].filter((d) => count[d]).sort((a, b) => count[b] - count[a] || a - b);
  const days = [...new Set([0, ...busiest, 2, 4])].slice(0, 3).sort((a, b) => a - b); // Sunday long run, then Tue / Thu
  const weeksRun = new Set(metas.filter((a) => a.sport === 'run').map((a) => startOfWeek(a.date))).size;
  const experience = weeksRun < 8 || weekly < 15000 ? 'beginner' : weekly > 45000 ? 'advanced' : 'intermediate';
  return { fit, vdot: fit?.vdot ?? null, weekly, runs: 3, days, longDay: 0, experience, start: addDays(startOfWeek(now), 7) };
}

/** Plan week (1-based) a time falls in, 0 before the start, past the end after it. */
export const weekOf = (plan, time) => Math.floor(Math.round((startOfDay(time) - plan.inputs.start) / 86400e3) / 7) + 1;

/** Sessions on the day of `time`. */
export const sessionsOn = (plan, time) => plan.sessions.filter((s) => s.date === startOfDay(time));

/** First session today or later, or null once the plan is over. */
export const nextSession = (plan, now) => plan.sessions.find((s) => s.date >= startOfDay(now)) ?? null;

/** A session as a workout for lib/workout.js startWorkout. */
export const sessionWorkout = (s) => ({ name: SESSION_TYPES[s.type].label, steps: s.steps });
