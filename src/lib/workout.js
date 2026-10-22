// Structured workouts: warm-up, N × (effort + recovery), cool-down. A step ends on time
// (running seconds) or distance (meters); each finished step is a lap, so the saved activity
// shows plan vs done in its laps. A step can target a pace, stored as an intensity name
// ('easy', 'threshold'… see lib/paces.js) and resolved to s/km when the workout starts, so a
// fitness change never rewrites a stored workout.

import { fmtLength } from './format.js';
import { t } from './i18n.js';
import { trainingPaces } from './paces.js';
import { elapsed, lap, spokenTime } from './recorder.js';

/**
 * Template: warmup / cooldown in s (0: none), work and rest { type: 'time' | 'dist', value },
 * optional pace target of the efforts (intensity name).
 */
export const DEFAULT_WORKOUT = { warmup: 600, reps: 6, work: { type: 'dist', value: 400 }, rest: { type: 'time', value: 90 }, cooldown: 300, pace: null };

/** Intensities a step can target, slowest first. */
export const INTENSITIES = [
  { id: 'easy', get label() { return t('Endurance'); } },
  { id: 'marathon', get label() { return t('Allure marathon'); } },
  { id: 'threshold', get label() { return t('Seuil'); } },
  { id: 'interval', get label() { return t('VO2max'); } },
  { id: 'repetition', get label() { return t('Vitesse'); } },
];

const min = (n) => n * 60;
const step = (kind, type, value, pace) => ({ kind, type, value, ...(pace && { target: { pace } }) });
const warm = (m) => step('warmup', 'time', min(m), 'easy');
const cool = (m) => step('cooldown', 'time', min(m), 'easy');
/** reps × (work, rest), no rest after the last one. */
const repeat = (reps, work, rest) => Array.from({ length: reps }, (_, i) => (i < reps - 1 && rest ? [work, rest] : [work])).flat();

/** Ready-made workouts: flat step lists. */
export const LIBRARY = [
  { id: 'fartlek', get name() { return t('Fartlek'); },
    steps: [warm(10), ...repeat(8, step('work', 'time', 60, 'interval'), step('rest', 'time', 60, 'easy')), cool(10)] },
  { id: 'hills', get name() { return t('Côtes'); }, // pace means little uphill: effort only
    steps: [warm(15), ...repeat(8, step('work', 'time', 60), step('rest', 'time', 90)), cool(10)] },
  { id: 'threshold', get name() { return t('Seuil'); },
    steps: [warm(15), ...repeat(3, step('work', 'time', min(10), 'threshold'), step('rest', 'time', 120, 'easy')), cool(10)] },
  { id: 'vo2', get name() { return t('VO2max'); },
    steps: [warm(15), ...repeat(5, step('work', 'dist', 1000, 'interval'), step('rest', 'time', 150)), cool(10)] },
  { id: 'progression', get name() { return t('Progressif'); },
    steps: [step('work', 'time', min(20), 'easy'), step('work', 'time', min(15), 'marathon'), step('work', 'time', min(10), 'threshold'), cool(5)] },
  { id: 'strides', get name() { return t('Lignes droites'); },
    steps: [step('warmup', 'time', min(30), 'easy'), ...repeat(6, step('work', 'time', 20, 'repetition'), step('rest', 'time', 60)), cool(5)] },
];

/** Flat step list: [{ kind: 'warmup' | 'work' | 'rest' | 'walk' | 'cooldown', type, value, rep?, target? }]. No rest after the last rep. */
export function workoutSteps(w) {
  const steps = [];
  if (w.warmup > 0) steps.push({ kind: 'warmup', type: 'time', value: w.warmup });
  for (let rep = 1; rep <= w.reps; rep++) {
    steps.push({ kind: 'work', ...w.work, rep, ...(w.pace && { target: { pace: w.pace } }) });
    if (rep < w.reps && w.rest.value > 0) steps.push({ kind: 'rest', ...w.rest, rep });
  }
  if (w.cooldown > 0) steps.push({ kind: 'cooldown', type: 'time', value: w.cooldown });
  return steps;
}

/** Effort (RPE 1-10) standing in for an intensity without a VDOT. */
export const INTENSITY_RPE = { easy: 3, marathon: 5, threshold: 7, interval: 8, repetition: 9 };

/**
 * Live state stored in the recording, from a template or a { name?, steps } workout. Pace
 * targets get their s/km range [fast, slow] from the VDOT; without one, an RPE target.
 */
export function startWorkout(w, vdot) {
  const paces = vdot && trainingPaces(vdot);
  let rep = 0;
  const steps = (w.steps ?? workoutSteps(w)).map((s) => {
    const out = { ...s, rep: s.kind === 'work' ? ++rep : rep };
    if (s.target?.pace) {
      if (paces) out.target = { ...s.target, range: paces[s.target.pace] };
      else out.target = { rpe: INTENSITY_RPE[s.target.pace] };
    }
    return out;
  });
  return { name: w.name, steps, reps: rep, i: 0, at: 0, dist: 0 };
}

/** Current step and what is left of it: { step, left } (s or m), or null once the workout is over. */
export function stepStatus(rec, now) {
  const w = rec.workout, step = w?.steps[w.i];
  if (!step) return null;
  const done = step.type === 'time' ? elapsed(rec, now) - w.at : rec.distance - w.dist;
  return { step, left: Math.max(0, step.value - done) };
}

/** Next step now, with a lap: the current one finished, or the lap button skipped it. */
export function nextStep(rec, now) {
  const w = rec.workout;
  if (!w?.steps[w.i] || rec.paused) return rec;
  return { ...lap(rec, now), workout: { ...w, i: w.i + 1, at: elapsed(rec, now), dist: rec.distance, samples: null, offSince: null } };
}

/** Called on the 1 s timer: moves on once the current step is done, else checks the pace. */
export function workoutStep(rec, now) {
  const s = stepStatus(rec, now);
  if (!s) return rec;
  return s.left <= 0 ? nextStep(rec, now) : paceCheck(rec, now);
}

const WINDOW = 30; // s of running the live pace is averaged over: GPS pace is noisy
const OFF_FOR = 20; // s outside the range before a cue
const CUE_EVERY = 60; // s between two cues

/** Pace (s/km) over the samples of the current step, or null until they span ~WINDOW s. */
export function livePace(w) {
  const first = w.samples?.[0], last = w.samples?.at(-1);
  if (!first || (last.time - first.time) / 1000 < WINDOW * 0.9 || last.dist <= first.dist) return null;
  return (last.time - first.time) / (last.dist - first.dist);
}

/**
 * On a work step with a pace range: samples { time, dist } over the last WINDOW s, and a cue
 * ('faster' | 'slower', at cueAt) once the pace stays outside the range for OFF_FOR s, at
 * most every CUE_EVERY s. Samples restart on each step and after a pause.
 */
export function paceCheck(rec, now) {
  const w = rec.workout, cur = w.steps[w.i], range = cur.target?.range;
  if (cur.kind !== 'work' || !range) return rec;
  if (rec.paused || rec.autoPaused) return w.samples ? { ...rec, workout: { ...w, samples: null, offSince: null } } : rec;
  const samples = [...(w.samples ?? []).filter((p) => now - p.time <= WINDOW * 1000), { time: now, dist: rec.distance }];
  const next = { ...w, samples };
  const pace = livePace(next);
  const off = pace == null ? null : pace < range[0] ? 'slower' : pace > range[1] ? 'faster' : null;
  next.offSince = off ? (w.offSince ?? now) : null;
  if (off && now - next.offSince >= OFF_FOR * 1000 && !(now - w.cueAt < CUE_EVERY * 1000)) Object.assign(next, { cue: off, cueAt: now });
  return { ...rec, workout: next };
}

/** Spoken pace cue. */
export const paceCueText = (cue) => t(cue === 'faster' ? 'Plus vite.' : 'Ralentis.');

const amount = (step) => (step.type === 'time' ? spokenTime(step.value) : fmtLength(step.value));

/** Short name of a step: "Effort 2/6", "Récupération"… spoken: "Effort 2 sur 6". */
export function stepLabel(step, reps, spoken = false) {
  if (step.kind === 'work' && reps === 1) return t('Effort');
  if (step.kind === 'work') return t(spoken ? 'Effort {n} sur {reps}' : 'Effort {n}/{reps}', { n: step.rep, reps });
  return { warmup: t('Échauffement'), rest: t('Récupération'), cooldown: t('Retour au calme'), walk: t('Marche') }[step.kind];
}

/** Spoken prompt for the step the workout just moved to. */
export function stepCue(rec) {
  const w = rec.workout, step = w.steps[w.i];
  if (!step) return t('Séance terminée.');
  return `${stepLabel(step, w.reps, true)} : ${amount(step)}.`;
}

/**
 * The workout as stored on the saved activity: its name and steps reached, one per lap, each
 * with its done `pace` (s/km, over 50 m or more) so plans check paces without loading tracks.
 */
export function savedWorkout(rec, now) {
  const w = rec.workout, laps = rec.laps ?? [];
  const end = { at: elapsed(rec, now), dist: rec.distance };
  return {
    ...(w.name && { name: w.name }),
    steps: w.steps.slice(0, w.i + 1).map(({ kind, type, value, rep, target }, k) => {
      const a = laps[k - 1] ?? { at: 0, dist: 0 }, b = laps[k] ?? end, d = b.dist - a.dist;
      return { kind, type, value, rep, ...(target && { target }), ...(d >= 50 && { pace: Math.round((b.at - a.at) / (d / 1000)) }) };
    }),
  };
}

/**
 * Laps of a recorded workout (lapIntervals) with their planned step: work set from the step
 * kind, and `hit` (done pace inside the target range) on steps with a pace target.
 */
export function planVsDone(laps, workout) {
  if (!workout?.steps?.length) return laps;
  return laps.map((l, i) => {
    const step = workout.steps[i];
    if (!step) return l;
    const range = step.target?.range;
    return { ...l, step, work: step.kind === 'work', ...(range && l.pace && { hit: l.pace >= range[0] && l.pace <= range[1] }) };
  });
}
