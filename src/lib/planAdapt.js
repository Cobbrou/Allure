// Plan adaptation (M5): checks that turn what was done into proposals the athlete accepts or
// dismisses, and the plan rewrites behind them. Nothing changes on its own. Every decision,
// accepted or dismissed, goes to `plan.adjustments` so a check does not ask again about the
// same runs. See docs/TRAINING_PLANS.md.

import { currentVdot, trainingPaces } from './paces.js';
import { addDays, estimate, GOALS, isHard, MIN_RUN, planWeeks, rebuild, round500, step, weekOf, weeklyVolumes } from './plan.js';
import { startOfDay } from './stats.js';

const DAY = 86400e3;
const FASTER = -0.02; // work steps 2 % faster than the target middle...
const EASY_RPE = 7; // ...at this effort or less: the paces are too easy
const SLOWER = 0.03; // 3 % slower, or an RPE of 9 or more: too hard
const HARD_RPE = 9;
const VOLUME_LOW = 0.75; // done / planned over the last 3 weeks
const VOLUME_HIGH = 1.15;

/** The plan with a decision logged: { kind: 'pace' | 'volume' | 'unwell', date, ... }. */
export const logAdjustment = (plan, entry) => ({ ...plan, adjustments: [...(plan.adjustments ?? []), entry] });
const lastDate = (plan, kinds) => Math.max(0, ...(plan.adjustments ?? []).filter((a) => kinds.includes(a.kind)).map((a) => a.date));

/**
 * Pace of the work steps of a recorded plan session against their target: mean of
 * done / target middle - 1 (negative: faster), or null without a done pace (free run, import).
 */
export function paceDeviation(a) {
  const work = (a.workout?.steps ?? []).filter((s) => s.kind === 'work' && s.pace && s.target?.range && s.target.pace !== 'easy');
  if (!work.length) return null;
  return work.reduce((n, s) => n + s.pace / ((s.target.range[0] + s.target.range[1]) / 2) - 1, 0) / work.length;
}

/**
 * Fitness change to propose, or null: a better current VDOT (race, best effort) since the
 * last change; else the last 3 key sessions all faster than target at RPE ≤ 7 (+1), or the
 * last 2 both slower or at RPE ≥ 9 (-1). { kind: 'pace', vdot, why: 'effort' | 'faster' | 'slower' }.
 */
export function paceProposal(plan, metas, matches, now) {
  const since = Math.max(plan.vdotHistory.at(-1).date, lastDate(plan, ['pace']));
  const fit = currentVdot(metas, now);
  if (fit && fit.activity.date > since && fit.vdot >= plan.vdot + 0.5) return { kind: 'pace', vdot: fit.vdot, why: 'effort', activity: fit.activity };
  const results = [];
  for (const s of plan.sessions) {
    const a = matches.get(s.id);
    const dev = a && a.date > since ? paceDeviation(a) : null;
    if (dev != null) results.push({ dev, rpe: a.rpe });
  }
  const tail = (n) => results.length >= n && results.slice(-n);
  if (tail(3) && tail(3).every((r) => r.dev < FASTER && !(r.rpe > EASY_RPE))) return { kind: 'pace', vdot: plan.vdot + 1, why: 'faster' };
  if (tail(2) && tail(2).every((r) => r.dev > SLOWER || r.rpe >= HARD_RPE)) return { kind: 'pace', vdot: plan.vdot - 1, why: 'slower' };
  return null;
}

/** New fitness: future sessions keep their steps (targets are intensity names), estimates follow. */
export function setVdot(plan, vdot, why, now) {
  const paces = trainingPaces(vdot), today = startOfDay(now);
  return {
    ...plan,
    vdot,
    vdotHistory: [...plan.vdotHistory, { date: now, vdot, why }],
    sessions: plan.sessions.map((s) => (s.date >= today ? { ...s, ...estimate(s.steps, paces) } : s)),
  };
}

const weekStart = (plan, week) => addDays(plan.inputs.start, 7 * (week - 1));

/**
 * Running volume of the last 3 full plan weeks against the plan, or null: under 75 %, propose
 * holding the volume (only when it was about to grow); over 115 %, warn. Not asked again over
 * weeks a volume decision or an unwell break already covers.
 * { kind: 'volume', ratio, hold: true } | { kind: 'volume', ratio, over: true }.
 */
export function volumeProposal(plan, metas, now) {
  const week = weekOf(plan, now);
  if (week < 4 || week >= plan.weeks.length) return null;
  const from = weekStart(plan, week - 3), to = weekStart(plan, week);
  if (lastDate(plan, ['volume', 'unwell']) >= from) return null;
  const planned = plan.sessions.filter((s) => s.week >= week - 3 && s.week < week && s.status !== 'moved').reduce((n, s) => n + s.distance, 0);
  const done = metas.filter((a) => a.sport === 'run' && a.date >= from && a.date < to).reduce((n, a) => n + a.distance, 0);
  if (!planned) return null;
  const ratio = done / planned;
  const next = plan.weeks[week], current = plan.weeks[week - 1];
  if (ratio < VOLUME_LOW && next.kind === 'build' && next.volume > current.volume) return { kind: 'volume', ratio, hold: true };
  if (ratio > VOLUME_HIGH) return { kind: 'volume', ratio, over: true };
  return null;
}

/**
 * Next week at the volume of the last build week so far instead of growing, the weeks after
 * it +10 % a week at most from there (lighter and taper weeks capped to match).
 */
export function holdVolume(plan, now) {
  const week = Math.max(weekOf(plan, now), 1);
  let level = plan.weeks.slice(0, week).findLast((w) => w.kind === 'build')?.volume ?? plan.weeks[week - 1].volume;
  const volumes = plan.weeks.map((w, i) => {
    if (i < week) return w;
    if (w.kind !== 'build') return { ...w, volume: Math.min(w.volume, round500(level * (w.kind === 'recovery' ? 0.8 : 1))) };
    level = Math.min(w.volume, i === week ? level : Math.floor((level * 1.1) / 500) * 500);
    return { ...w, volume: level };
  });
  return rebuild(plan, plan.inputs, volumes, now);
}

/** Return weeks after a break, as shares of the planned volume. */
export const RAMPS = { slow: [0.7, 0.85], balanced: [0.8], fast: [0.9] };

/**
 * "Not feeling well" from today for `days` (3-14): mode 'easy' (every run easy, same
 * distance), 'shorter' (easy, -40 %) or 'rest' (skipped); then the `ramp` weeks: easy and
 * long runs at a share of their distance, quality kept except in the first slow week. The
 * race and sessions already done or decided are never touched.
 * ponytail: the peak is not pushed back; regenerate the plan when the break was long.
 */
export function unwell(plan, { days, mode, ramp }, now, matches = new Map()) {
  const from = startOfDay(now), to = addDays(from, days), shares = RAMPS[ramp];
  const end = addDays(to, 7 * shares.length);
  const paces = trainingPaces(plan.vdot);
  const easy = (s, d) => {
    const steps = [step('work', 'dist', Math.max(MIN_RUN, round500(d)), 'easy')];
    return { ...s, type: s.type === 'long' ? 'long' : 'easy', steps, ...estimate(steps, paces) };
  };
  const sessions = plan.sessions.map((s) => {
    if (s.date < from || s.date >= end || s.type === 'race' || s.status || matches.has(s.id)) return s;
    if (s.date < to) return mode === 'rest' ? { ...s, status: 'skipped' } : easy(s, s.distance * (mode === 'shorter' ? 0.6 : 1));
    const k = Math.floor(Math.round((s.date - to) / DAY) / 7);
    if (isHard(s.type) && s.type !== 'long' && !(ramp === 'slow' && k === 0)) return s;
    return easy(s, s.distance * shares[k]);
  });
  return logAdjustment({ ...plan, sessions }, { kind: 'unwell', date: now, from, to, options: { days, mode, ramp } });
}

/**
 * The plan generated again from next week: new race date, current fitness and recent weekly
 * volume (m), same goal and days. Past and current weeks are kept.
 */
export function regenerate(plan, { raceDate, vdot, weekly }, now) {
  const inputs = { ...plan.inputs, raceDate, weekly };
  const week = Math.max(weekOf(plan, now), 0);
  const weeks = Math.max(GOALS[inputs.goal].taper + 1, planWeeks(inputs));
  const volumes = [...plan.weeks.slice(0, week), ...weeklyVolumes(inputs, weeks - week)];
  const out = rebuild(plan, inputs, volumes, now, vdot);
  return vdot === plan.vdot ? out : { ...out, vdotHistory: [...plan.vdotHistory, { date: now, vdot, why: 'regenerate' }] };
}

/** Earliest race date regenerate accepts: room for next week and the taper after the current week. */
export const earliestRace = (plan, now) => weekStart(plan, Math.max(weekOf(plan, now), 0) + 1 + GOALS[plan.goal.kind].taper);

/** Open proposals, most useful first. */
export const proposals = (plan, metas, matches, now) =>
  [paceProposal(plan, metas, matches, now), volumeProposal(plan, metas, now)].filter(Boolean);
