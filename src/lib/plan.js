// Running training plans: a goal race in, a periodized program of structured sessions out.
// Rule-based so every number can be explained (docs/TRAINING_PLANS.md): volume grows 10 % a
// week at most with a lighter week every 3-4 weeks, the long run is capped, ~80 % of running
// is easy and hard days are never back to back. Sessions are workout step lists (lib/workout.js)
// whose paces are intensity names, resolved against the VDOT when a session starts.

import { t } from './i18n.js';
import { currentVdot, trainingPaces } from './paces.js';
import { isRun } from './sports.js';
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

/**
 * Programs without a race (M6). weeks: [shortest, default, longest]; effort: steps carry RPE
 * targets, never paces (beginners, or fitness too old after a break).
 */
export const PROGRAMS = {
  start: { get label() { return t('Débuter la course'); }, weeks: [6, 9, 16], effort: true },
  return: { get label() { return t('Reprendre la course'); }, effort: true },
  fitness: { get label() { return t('Garder la forme'); } },
};

/** True for a race plan (GOALS), false for a program. */
export const isRace = (plan) => !!GOALS[plan.goal.kind];
export const planLabel = (plan) => (GOALS[plan.goal.kind] ?? PROGRAMS[plan.goal.kind]).label;

export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'];

export const PHASES = {
  base: { get label() { return t('Fondation'); } },
  build: { get label() { return t('Développement'); } },
  peak: { get label() { return t('Spécifique'); } },
  taper: { get label() { return t('Affûtage'); } },
};

export const SESSION_TYPES = {
  easy: { get label() { return t('Footing'); } },
  walkRun: { get label() { return t('Course et marche'); } },
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
const WALK_PACE = 600; // s/km, brisk walk
const NO_FITNESS_PACE = 450; // s/km, easy jog assumed without a VDOT

/**
 * Estimated { distance, duration } of steps; untargeted steps at the slow end of easy. paces:
 * trainingPaces, or null without a VDOT.
 */
export function estimate(steps, paces) {
  let distance = 0, duration = 0;
  for (const s of steps) {
    const pace = s.kind === 'walk' ? WALK_PACE : !paces ? NO_FITNESS_PACE : s.target?.pace ? mid(paces[s.target.pace]) : paces.easy[1];
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

/** Long run, quality sessions and easy runs (strides on the first one in base / build) of a week. */
function trainingWeek(add, { inputs, days, weekStart, week, phase, volume, r, nq, longCap, paces }) {
  const qDays = qualityDays(days, inputs.longDay, nq);
  const types = qualityTypes(phase, qDays.length, week - 1);
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

/** Session list and its builder: ids are "<week>-<weekday>", estimates from `paces` (null: no VDOT). */
function sessionList(paces) {
  const sessions = [];
  const add = (date, week, phase, type, steps) => {
    sessions.push({ id: `${week}-${new Date(date).getDay()}`, date, week, phase, type, steps, ...estimate(steps, paces) });
  };
  return { sessions, add };
}

/** The stored plan. date: race day or last day of the program, null when open-ended. */
const planOf = (inputs, now, weeks, sessions, date) => ({
  id: String(now),
  created: now,
  goal: { kind: inputs.goal, date },
  inputs,
  vdot: inputs.vdot ?? null,
  vdotHistory: [{ date: now, vdot: inputs.vdot ?? null, why: 'start' }],
  weeks,
  sessions: sessions.sort((a, b) => a.date - b.date),
  adjustments: [],
});

const longCapOf = (cap, paces) => Math.min(cap, round500((LONG_TIME / (paces?.easy[1] ?? NO_FITNESS_PACE)) * 1000));
const qualityCount = (inputs, days) => (EXPERIENCE.indexOf(inputs.experience) > 0 && days.length >= 4 ? 2 : 1);

/**
 * The plan for the wizard inputs:
 * { goal, raceDate, start (first day of week 1), vdot, weekly (m, recent average), runs,
 *   days (getDay values), longDay, experience }; programs (PROGRAMS) take their own inputs.
 * Same inputs, same plan. `now` stamps it. `fixed`: week volumes to keep (changeDays).
 */
export function generatePlan(inputs, now = Date.now(), fixed = null) {
  if (inputs.goal === 'start') return startPlan(inputs, now);
  if (inputs.goal === 'return') return returnPlan(inputs, now, fixed);
  if (inputs.goal === 'fitness') return fitnessPlan(inputs, now, fixed);
  const g = GOALS[inputs.goal];
  const paces = trainingPaces(inputs.vdot);
  const weeks = Math.max(g.taper + 1, planWeeks(inputs));
  const phases = planPhases(weeks, g.taper);
  const volumes = fixed ?? weeklyVolumes(inputs, weeks);
  const days = [...new Set([...inputs.days, inputs.longDay])].slice(0, 7);
  const nq = qualityCount(inputs, days);
  const longCap = longCapOf(g.longCap, paces);
  const raceDay = startOfDay(inputs.raceDate);
  const { sessions, add } = sessionList(paces);

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
    trainingWeek(add, { inputs, days, weekStart, week, phase, volume, r, nq: phase === 'taper' ? 1 : nq, longCap, paces });
  }
  return planOf(inputs, now, volumes.map((v, i) => ({ ...v, phase: phases[i] })), sessions, raceDay);
}

// Programs without a race (M6), see docs/TRAINING_PLANS.md. Effort targets (RPE 1-10) only:
// beginners have no VDOT, and after a break the old one is too fast.

const effort = (kind, type, value, rpe) => ({ kind, type, value, target: { rpe } });
const RUN_RPE = 3; // easy: can talk in full sentences
const WALK_RPE = 2;
const EASY_RPE = 3;

/**
 * Walk / run ladder of the start-running program, [run s, walk s, reps]: from 8 × 1 min of
 * running to 30 min non-stop.
 */
export const LADDER = [
  [60, 90, 8], [90, 90, 6], [120, 90, 6], [180, 90, 5], [240, 90, 4], [360, 90, 3],
  [480, 90, 3], [720, 90, 2], [1200, 0, 1], [1500, 0, 1], [1800, 0, 1],
];
/** "How long can you run non-stop?" answer -> first rung. */
export const START_LEVELS = { none: 0, five: 4, ten: 6 };
/** Default length of the start-running program from a rung: about a rung a week. */
export const startWeeks = (level) => Math.min(PROGRAMS.start.weeks[2], Math.max(PROGRAMS.start.weeks[0], LADDER.length - level));

/** Steps of a rung: 5 min walk, run / walk reps, 5 min walk. */
export function ladderSteps(level) {
  const [run, walk, reps] = LADDER[level];
  return [effort('walk', 'time', 300, WALK_RPE), ...repeat(reps, effort('work', 'time', run, RUN_RPE), effort('walk', 'time', walk, WALK_RPE)), effort('walk', 'time', 300, WALK_RPE)];
}

/**
 * Start running: { goal: 'start', start, weeks (6-16), level (rung), days }. Every session of
 * a week on the same rung, the rungs spread over the weeks up to 30 min non-stop in the last.
 */
function startPlan(inputs, now) {
  const { weeks, level } = inputs, last = LADDER.length - 1;
  const { sessions, add } = sessionList(null);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const rung = weeks > 1 ? level + Math.floor(((last - level) * w) / (weeks - 1)) : last;
    const continuous = LADDER[rung][2] === 1, phase = continuous ? 'build' : 'base';
    const weekStart = addDays(inputs.start, 7 * w);
    for (const d of inputs.days) add(dateIn(weekStart, d), w + 1, phase, continuous ? 'easy' : 'walkRun', ladderSteps(rung));
    out.push({ volume: sessions.filter((s) => s.week === w + 1).reduce((n, s) => n + s.distance, 0), kind: 'build', phase });
  }
  return planOf(inputs, now, out, sessions, addDays(inputs.start, 7 * weeks - 1));
}

/** Break lengths of the return-to-running program: share of the old volume to restart at. */
export const BREAKS = { short: 0.6, medium: 0.4, long: 0.25 };
const INJURY_SHARE = 0.75; // after an injury, a quarter lower...
const INJURY_GROWTH = 1.05; // ...+5 % a week, a lighter week every 3rd

/**
 * Weeks of a return: from a share of the old weekly volume (break length, injury) back up to
 * it, +10 % a week (+5 % after an injury) with lighter weeks; 4 to 16 weeks.
 */
export function returnVolumes({ weekly, runs, breakLength, injury }) {
  const target = Math.max(round500(weekly || 0), runs * MIN_RUN);
  const growth = injury ? INJURY_GROWTH : MAX_GROWTH, every = injury ? 3 : 4;
  let level = Math.max(runs * MIN_RUN, Math.floor((target * BREAKS[breakLength] * (injury ? INJURY_SHARE : 1)) / 500) * 500);
  const out = [];
  while (out.length < 16 && (out.length < 4 || level < target)) {
    const w = out.length;
    if ((w + 1) % every === 0) out.push({ volume: round500(level * RECOVERY), kind: 'recovery' });
    else {
      if (w > 0) level = Math.min(target, Math.max(level + 500, Math.floor((level * growth) / 500) * 500));
      out.push({ volume: level, kind: 'build' });
    }
  }
  return out;
}

/** A week of easy running by effort: a long run, easy runs sharing the rest. */
function easyWeek(add, { inputs, weekStart, week, phase, volume, longCap, strides }) {
  const long = Math.min(longCap, Math.max(MIN_RUN, round500(volume * (inputs.days.length <= 3 ? 0.35 : 0.3))));
  const easyDays = inputs.days.filter((d) => d !== inputs.longDay);
  const easy = easyDays.length && Math.min(round500(long * EASY_SHARE), Math.max(MIN_RUN, round500((volume - long) / easyDays.length)));
  add(dateIn(weekStart, inputs.longDay), week, phase, 'long', [effort('work', 'dist', long, EASY_RPE)]);
  easyDays.forEach((d, i) => add(dateIn(weekStart, d), week, phase, 'easy', strides && i === 0
    ? [effort('work', 'dist', easy, EASY_RPE), ...repeat(6, effort('work', 'time', 20, 8), step('rest', 'time', 60))]
    : [effort('work', 'dist', easy, EASY_RPE)]));
}

/**
 * Return to running: { goal: 'return', start, weekly (m before the break), breakLength
 * (BREAKS), injury, days, longDay, runs, vdot? }. Easy runs by effort, strides in the last
 * 2 weeks unless injured. The VDOT only estimates durations.
 */
function returnPlan(inputs, now, fixed) {
  const volumes = fixed ?? returnVolumes(inputs);
  const paces = inputs.vdot ? trainingPaces(inputs.vdot) : null;
  const longCap = longCapOf(GOALS.half.longCap, paces);
  const { sessions, add } = sessionList(paces);
  volumes.forEach(({ volume }, w) => easyWeek(add, {
    inputs, weekStart: addDays(inputs.start, 7 * w), week: w + 1, phase: 'base', volume, longCap,
    strides: !inputs.injury && w >= volumes.length - 2,
  }));
  return planOf(inputs, now, volumes.map((v) => ({ ...v, phase: 'base' })), sessions, addDays(inputs.start, 7 * volumes.length - 1));
}

const BLOCK = 4; // weeks of a fitness block: 3 steady, 1 lighter

/** Volumes of `weeks` fitness weeks: the same weekly volume, every 4th week lighter. */
export function fitnessVolumes({ weekly, runs }, weeks) {
  const level = Math.floor(Math.min(Math.max(weekly || 0, runs * 4000), runs * RUN_CAP) / 500) * 500;
  return Array.from({ length: weeks }, (_, w) => ((w + 1) % BLOCK ? { volume: level, kind: 'build' } : { volume: round500(level * RECOVERY), kind: 'recovery' }));
}

/**
 * Fitness / maintenance: { goal: 'fitness', start, weekly, runs, days, longDay, experience,
 * vdot? }, open-ended. Rolling 4-week blocks at a steady volume, hills / fartlek blocks and
 * intervals / threshold blocks in turn, quality sessions a little longer over the first 3
 * blocks. `fixed`: the volume of every week so far (extendPlan appends blocks).
 */
function fitnessPlan(inputs, now, fixed) {
  const volumes = fixed ?? fitnessVolumes(inputs, BLOCK);
  const paces = inputs.vdot ? trainingPaces(inputs.vdot) : null;
  const days = [...new Set([...inputs.days, inputs.longDay])];
  const nq = qualityCount(inputs, days), longCap = longCapOf(GOALS.half.longCap, paces);
  const { sessions, add } = sessionList(paces);
  const phase = (w) => (Math.floor(w / BLOCK) % 2 ? 'build' : 'base');
  volumes.forEach(({ volume, kind }, w) => trainingWeek(add, {
    inputs, days, weekStart: addDays(inputs.start, 7 * w), week: w + 1, phase: phase(w), volume,
    r: kind === 'recovery' ? 0 : Math.min(1, Math.floor(w / BLOCK) / 2), nq, longCap, paces,
  }));
  return planOf(inputs, now, volumes.map((v, w) => ({ ...v, phase: phase(w) })), sessions, null);
}

/** A fitness plan with blocks added until the athlete is 2 weeks or more from its end. */
export function extendPlan(plan, now) {
  const n = plan.weeks.length;
  if (plan.goal.kind !== 'fitness' || weekOf(plan, now) < n - 1) return plan;
  const volumes = [...plan.weeks.map(({ volume, kind }) => ({ volume, kind })), ...fitnessVolumes(plan.inputs, n + BLOCK).slice(n)];
  const fresh = generatePlan({ ...plan.inputs, vdot: plan.vdot }, now, volumes);
  return extendPlan({ ...plan, weeks: [...plan.weeks, ...fresh.weeks.slice(n)], sessions: [...plan.sessions, ...fresh.sessions.filter((s) => s.week > n)] }, now);
}

/**
 * Wizard defaults from history: fitness, average weekly running volume of the last 4 full
 * weeks, the busiest weekdays, experience; the plan starts next week.
 */
export function planDefaults(metas, now = Date.now()) {
  const fit = currentVdot(metas, now);
  const weekly = Math.round(weeklyDistance(metas, now, 5, 'run').slice(0, 4).reduce((s, w) => s + w.distance, 0) / 4);
  const recent = metas.filter((a) => isRun(a.sport) && a.date > now - 56 * 86400e3 && a.date <= now);
  const count = Array(7).fill(0);
  for (const a of recent) count[new Date(a.date).getDay()]++;
  const busiest = [0, 1, 2, 3, 4, 5, 6].filter((d) => count[d]).sort((a, b) => count[b] - count[a] || a - b);
  const days = [...new Set([0, ...busiest, 2, 4])].slice(0, 3).sort((a, b) => a - b); // Sunday long run, then Tue / Thu
  const weeksRun = new Set(metas.filter((a) => isRun(a.sport)).map((a) => startOfWeek(a.date))).size;
  const experience = weeksRun < 8 || weekly < 15000 ? 'beginner' : weekly > 45000 ? 'advanced' : 'intermediate';
  // Before a break: the 4 weeks up to the last run, and how long ago it was.
  const lastRun = Math.max(0, ...metas.filter((a) => isRun(a.sport) && a.date <= now).map((a) => a.date));
  const before = lastRun ? Math.round(weeklyDistance(metas, addDays(lastRun, 7), 5, 'run').slice(0, 4).reduce((s, w) => s + w.distance, 0) / 4) : 0;
  const off = (now - lastRun) / DAY;
  const breakLength = off < 30 ? 'short' : off < 90 ? 'medium' : 'long';
  return { fit, vdot: fit?.vdot ?? null, weekly, before, breakLength, runs: 3, days, longDay: 0, experience, start: addDays(startOfWeek(now), 7) };
}

/** Plan week (1-based) a time falls in, 0 before the start, past the end after it. */
export const weekOf = (plan, time) => Math.floor(Math.round((startOfDay(time) - plan.inputs.start) / 86400e3) / 7) + 1;

/** The 7 day starts of a plan week. */
export const weekDays = (plan, week) =>
  Array.from({ length: 7 }, (_, i) => startOfDay(plan.inputs.start + ((week - 1) * 7 + i) * 86400e3 + 12 * 3600e3)); // noon: DST-proof

/** Sessions on the day of `time`. */
export const sessionsOn = (plan, time) => plan.sessions.filter((s) => s.date === startOfDay(time));

/** First session today or later still to run (not skipped, not done), or null once the plan is over. */
export const nextSession = (plan, now, matches = new Map()) =>
  plan.sessions.find((s) => s.date >= startOfDay(now) && !s.status && !matches.has(s.id)) ?? null;

/** A session as a workout for lib/workout.js startWorkout; `heat`: pace slowdown accepted for the forecast. */
export const sessionWorkout = (s) => ({ name: SESSION_TYPES[s.type].label, steps: s.steps, ...(s.heat && { heat: s.heat.factor }) });

// Completion (M4): what was done is computed on read from the activities, never stored. A
// session only stores what the athlete decided: `status` ('skipped', or 'moved' once a missed
// key session was made up), `activity` (an id linked by hand, null when unlinked by hand) and
// `from` (the missed session it makes up for).

const DAY = 86400e3;
const SLACK = 0.2; // done within ±20 % of the planned distance or duration
const dayDiff = (a, b) => Math.round((a - b) / DAY); // DST-proof: days are 23 to 25 h long

/** Done / planned ratio, by distance or duration, whichever is closer to 1; done within ±20 %. */
export function compliance(s, a) {
  const r = [a.distance / s.distance, a.movingTime / s.duration].filter(Number.isFinite);
  const ratio = r.length ? r.reduce((b, x) => (Math.abs(x - 1) < Math.abs(b - 1) ? x : b)) : 0;
  return { ratio, done: Math.abs(ratio - 1) <= SLACK };
}

/**
 * Activity of each session (Map session id -> activity meta). Links made by hand first, then
 * each run goes to an open session of the same day, else the day before or after, the closest
 * in distance / duration. A run matches one session at most.
 */
export function matchSessions(plan, metas) {
  const out = new Map(), used = new Set();
  const byId = new Map(metas.map((a) => [a.id, a]));
  for (const s of plan.sessions) {
    const a = s.activity && byId.get(s.activity);
    if (a) { out.set(s.id, a); used.add(a.id); }
  }
  const open = plan.sessions.filter((s) => s.activity === undefined && !s.status);
  const runs = metas.filter((a) => isRun(a.sport) && !used.has(a.id)).sort((a, b) => a.date - b.date);
  for (const off of [0, 1]) {
    for (const a of runs) {
      if (used.has(a.id)) continue;
      const day = startOfDay(a.date);
      let best = null, score = Infinity;
      for (const s of open) {
        if (out.has(s.id) || Math.abs(dayDiff(s.date, day)) !== off) continue;
        const sc = Math.abs(Math.log(compliance(s, a).ratio || 0.01));
        if (sc < score) { best = s; score = sc; }
      }
      if (best) { out.set(best.id, a); used.add(a.id); }
    }
  }
  return out;
}

/** 'done' | 'partial' (run, off by more than 20 %) | 'skipped' | 'moved' | 'missed' | 'planned'. */
export function sessionState(s, a, now) {
  if (a) return compliance(s, a).done ? 'done' : 'partial';
  if (s.status) return s.status;
  return s.date < startOfDay(now) ? 'missed' : 'planned';
}

/** Another hard session, still on, the day before or after `date`. */
export const hardNextTo = (plan, date, except) =>
  plan.sessions.some((s) => s !== except && !s.status && isHard(s.type) && Math.abs(dayDiff(s.date, date)) === 1);

const withSessions = (plan, map) => ({ ...plan, sessions: plan.sessions.map(map).sort((a, b) => a.date - b.date) });

/** A session moved to another day; the session already on that day, if any, takes its place. */
export function moveSession(plan, id, date) {
  const s = plan.sessions.find((x) => x.id === id);
  const other = plan.sessions.find((x) => x.date === date && x !== s);
  return withSessions(plan, (x) => (x === s ? { ...x, date } : x === other ? { ...x, date: s.date } : x));
}

/**
 * Easy run of the same week a missed key session can replace: today or later, still open,
 * no hard session the day before or after. Null when there is none, or the session was made
 * up already, or is itself a make-up. A missed session is never crammed in another way.
 */
export function makeUpSlot(plan, id, now, matches = new Map()) {
  const m = plan.sessions.find((s) => s.id === id);
  if (!m || !isHard(m.type) || m.type === 'race' || m.status || m.from) return null;
  return plan.sessions.find((s) => s.week === m.week && s.date >= startOfDay(now) && s.type === 'easy' && !s.status
    && !matches.has(s.id) && !hardNextTo(plan, s.date, m)) ?? null;
}

/** The plan with the missed session `id` in place of `slot` (from makeUpSlot). */
export const makeUp = (plan, id, slot) => {
  const m = plan.sessions.find((s) => s.id === id);
  const { type, steps, distance, duration } = m;
  return withSessions(plan, (s) => (s === m ? { ...s, status: 'moved' } : s.id === slot.id ? { ...s, type, steps, distance, duration, from: id } : s));
};

/**
 * New run days from next week on: the weeks after the current one are generated again with
 * the same volumes (capped for fewer days), the current and past weeks are kept.
 */
export function changeDays(plan, runDays, longDay, now) {
  const inputs = { ...plan.inputs, days: runDays, longDay, runs: runDays.length };
  return rebuild(plan, inputs, plan.weeks.map(({ volume, kind }) => ({ volume: Math.min(volume, runDays.length * RUN_CAP), kind })), now);
}

/**
 * The plan generated again from next week on, from `inputs` (same start) and the week
 * `volumes` (one per week up to the race); the current and past weeks are kept.
 */
export function rebuild(plan, inputs, volumes, now, vdot = plan.vdot) {
  const week = Math.max(weekOf(plan, now), 0);
  const fresh = generatePlan({ ...inputs, vdot }, now, volumes);
  return {
    ...plan,
    inputs,
    vdot,
    goal: fresh.goal,
    weeks: [...plan.weeks.slice(0, week), ...fresh.weeks.slice(week)],
    sessions: [...plan.sessions.filter((s) => s.week <= week), ...fresh.sessions.filter((s) => s.week > week)],
  };
}

// Extras (M7)

/** Cumulative even-split times of a race: one per `step` m (a km or a mile), and the finish. [{ dist, time }]. */
export function evenSplits(time, distance, step) {
  const out = [];
  for (let d = step; d < distance - 1; d += step) out.push({ dist: d, time: Math.round((time * d) / distance) });
  return [...out, { dist: distance, time: Math.round(time) }];
}

/** Median start hour of the runs of the last 60 days (local time), 8 without any. */
export function usualHour(metas, now = Date.now()) {
  const h = metas.filter((a) => isRun(a.sport) && a.date > now - 60 * DAY && a.date <= now).map((a) => new Date(a.date).getHours()).sort((a, b) => a - b);
  return h.length ? h[Math.floor(h.length / 2)] : 8;
}

/**
 * End-of-plan figures: { weeks, planned, done (sessions run), distance, time (s, every run
 * matched to a session), vdotFrom, vdotTo, race?: { time, distance, activity } }.
 */
export function planRecap(plan, matches) {
  const runs = [...matches.values()];
  const race = plan.sessions.find((s) => s.type === 'race');
  const a = race && matches.get(race.id);
  return {
    weeks: plan.weeks.length,
    planned: plan.sessions.filter((s) => s.status !== 'moved').length,
    done: runs.length,
    distance: runs.reduce((n, r) => n + r.distance, 0),
    time: runs.reduce((n, r) => n + r.movingTime, 0),
    vdotFrom: plan.vdotHistory[0]?.vdot ?? null,
    vdotTo: plan.vdot,
    ...(a && { race: { time: a.bestEfforts?.[plan.goal.kind] ?? a.movingTime, distance: a.distance, activity: a } }),
  };
}

const REMIND_DAYS = 14; // reminders scheduled ahead; the app schedules again on each launch

/** Sessions to remind of at `hour` on their day, from now on over the next 14 days: [{ at, session }]. */
export const reminderList = (plan, now, hour, matches = new Map()) => plan.sessions
  .filter((s) => !s.status && !matches.has(s.id) && s.date < now + REMIND_DAYS * DAY)
  .map((s) => ({ at: new Date(s.date).setHours(hour), session: s }))
  .filter((r) => r.at > now);

export { addDays, round500, MIN_RUN, step };
