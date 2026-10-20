// Structured workouts: warm-up, N × (effort + recovery), cool-down. A step ends on time
// (running seconds) or distance (meters); each finished step is a lap, so the saved activity
// shows plan vs done in its laps.

import { fmtLength } from './format.js';
import { t } from './i18n.js';
import { elapsed, lap, spokenTime } from './recorder.js';

/** Template: warmup / cooldown in s (0: none), work and rest { type: 'time' | 'dist', value }. */
export const DEFAULT_WORKOUT = { warmup: 600, reps: 6, work: { type: 'dist', value: 400 }, rest: { type: 'time', value: 90 }, cooldown: 300 };

/** Flat step list: [{ kind: 'warmup' | 'work' | 'rest' | 'cooldown', type, value, rep? }]. No rest after the last rep. */
export function workoutSteps(w) {
  const steps = [];
  if (w.warmup > 0) steps.push({ kind: 'warmup', type: 'time', value: w.warmup });
  for (let rep = 1; rep <= w.reps; rep++) {
    steps.push({ kind: 'work', ...w.work, rep });
    if (rep < w.reps && w.rest.value > 0) steps.push({ kind: 'rest', ...w.rest, rep });
  }
  if (w.cooldown > 0) steps.push({ kind: 'cooldown', type: 'time', value: w.cooldown });
  return steps;
}

/** Live state stored in the recording, from a template. */
export const startWorkout = (w) => ({ steps: workoutSteps(w), reps: w.reps, i: 0, at: 0, dist: 0 });

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
  return { ...lap(rec, now), workout: { ...w, i: w.i + 1, at: elapsed(rec, now), dist: rec.distance } };
}

/** Called on the 1 s timer: moves on once the current step is done. */
export function workoutStep(rec, now) {
  const s = stepStatus(rec, now);
  return s && s.left <= 0 ? nextStep(rec, now) : rec;
}

const amount = (step) => (step.type === 'time' ? spokenTime(step.value) : fmtLength(step.value));

/** Short name of a step: "Effort 2/6", "Récupération"… spoken: "Effort 2 sur 6". */
export function stepLabel(step, reps, spoken = false) {
  if (step.kind === 'work') return t(spoken ? 'Effort {n} sur {reps}' : 'Effort {n}/{reps}', { n: step.rep, reps });
  return { warmup: t('Échauffement'), rest: t('Récupération'), cooldown: t('Retour au calme') }[step.kind];
}

/** Spoken prompt for the step the workout just moved to. */
export function stepCue(rec) {
  const w = rec.workout, step = w.steps[w.i];
  if (!step) return t('Séance terminée.');
  return `${stepLabel(step, w.reps, true)} : ${amount(step)}.`;
}
