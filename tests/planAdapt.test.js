import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trainingPaces } from '../src/lib/paces.js';
import { defaultRaceDate, generatePlan, isHard, weekOf } from '../src/lib/plan.js';
import { earliestRace, holdVolume, logAdjustment, paceDeviation, paceProposal, regenerate, setVdot, unwell, volumeProposal } from '../src/lib/planAdapt.js';

const DAY = 86400e3;
const START = new Date(2026, 10, 2).getTime(); // a Monday
const plan = generatePlan({
  goal: 'marathon', start: START, raceDate: defaultRaceDate('marathon', START, 0), vdot: 45, weekly: 30000,
  runs: 4, days: [0, 2, 4, 6], longDay: 0, experience: 'intermediate',
}, START - DAY);
const paces = trainingPaces(45);
const quality = plan.sessions.filter((s) => isHard(s.type) && s.type !== 'long' && s.type !== 'hills');

/** A recorded plan session: work steps run at `share` of the target middle. */
function run(s, share, rpe) {
  const steps = s.steps.map((st) => {
    const range = st.target && paces[st.target.pace];
    return { ...st, ...(range && { target: { ...st.target, range }, pace: Math.round(((range[0] + range[1]) / 2) * share) }) };
  });
  return { id: `a${s.id}`, sport: 'run', date: s.date + 8 * 3600e3, distance: s.distance, movingTime: s.duration, workout: { steps }, ...(rpe && { rpe }) };
}
const matched = (sessions, share, rpe) => new Map(sessions.map((s) => [s.id, run(s, share, rpe)]));

test('paceDeviation compares work steps with their target, null without done paces', () => {
  assert.ok(Math.abs(paceDeviation(run(quality[0], 0.95)) + 0.05) < 0.01);
  assert.equal(paceDeviation({ sport: 'run' }), null);
  assert.equal(paceDeviation(run(plan.sessions.find((s) => s.type === 'easy' && s.steps.length === 1), 0.9)), null); // easy targets don't count
});

test('paceProposal: 3 key sessions faster at a moderate effort, 2 too hard, or a better effort', () => {
  const three = quality.slice(0, 3), now = three[2].date + DAY;
  assert.deepEqual(paceProposal(plan, [], matched(three, 0.96, 6), now), { kind: 'pace', vdot: 46, why: 'faster' });
  assert.equal(paceProposal(plan, [], matched(three, 0.96, 8), now), null); // felt hard
  assert.equal(paceProposal(plan, [], matched(three.slice(0, 2), 0.96), now), null); // only 2
  assert.deepEqual(paceProposal(plan, [], matched(three.slice(0, 2), 1, 9), now), { kind: 'pace', vdot: 44, why: 'slower' });
  assert.deepEqual(paceProposal(plan, [], matched(three.slice(0, 2), 1.05), now), { kind: 'pace', vdot: 44, why: 'slower' });
  // Decided once: the same runs don't ask again.
  assert.equal(paceProposal(logAdjustment(plan, { kind: 'pace', date: now, dismissed: true }), [], matched(three, 0.96), now + 1), null);
  // A 10 km in 42:00 (VDOT ~49) after the plan started.
  const race = { id: 'r', sport: 'run', date: START + 3 * DAY, distance: 10000, movingTime: 2520 };
  const p = paceProposal(plan, [race], new Map(), START + 4 * DAY);
  assert.equal(p.why, 'effort');
  assert.ok(p.vdot > 48 && p.vdot < 50);
});

test('setVdot keeps the steps and re-estimates future sessions only', () => {
  const now = START + 14 * DAY;
  const out = setVdot(plan, 50, 'faster', now);
  const total = (p) => p.sessions.reduce((n, s) => n + s.duration, 0);
  assert.ok(total(out) < total(plan));
  assert.equal(out.vdot, 50);
  assert.equal(out.vdotHistory.at(-1).vdot, 50);
  for (const [i, s] of out.sessions.entries()) {
    assert.equal(s.steps, plan.sessions[i].steps);
    if (s.date < now) assert.equal(s.duration, plan.sessions[i].duration);
    else assert.ok(s.duration <= plan.sessions[i].duration); // timed steps keep their length
  }
});

test('volumeProposal: done vs planned over the last 3 weeks', () => {
  const now = START + 3 * 7 * DAY + DAY; // week 4
  const planned = plan.sessions.filter((s) => s.week < 4);
  const runs = (share) => planned.map((s) => ({ sport: 'run', date: s.date + 3600e3, distance: s.distance * share }));
  const next = plan.weeks[4];
  assert.equal(volumeProposal(plan, runs(1), now), null);
  if (next.kind === 'build' && next.volume > plan.weeks[3].volume) assert.equal(volumeProposal(plan, runs(0.6), now + 7 * DAY)?.hold, true);
  assert.equal(volumeProposal(plan, runs(1.3), now).over, true);
  assert.equal(volumeProposal(plan, runs(1.3), START + 14 * DAY), null); // not 3 weeks yet
  assert.equal(volumeProposal(logAdjustment(plan, { kind: 'unwell', date: START + 15 * DAY }), runs(1.3), now), null);
});

test('holdVolume: next week stays at the last build volume, then +10 % a week at most', () => {
  const now = START + 4 * 7 * DAY + DAY; // week 5
  const out = holdVolume(plan, now);
  const level = plan.weeks.slice(0, 5).findLast((w) => w.kind === 'build').volume;
  assert.deepEqual(out.weeks.slice(0, 5), plan.weeks.slice(0, 5));
  assert.ok(out.weeks[5].volume <= level);
  let last = level;
  for (const w of out.weeks.slice(5)) {
    assert.ok(w.volume <= plan.weeks[out.weeks.indexOf(w)].volume);
    if (w.kind === 'build') { assert.ok(w.volume <= last * 1.1); last = w.volume; }
  }
  assert.deepEqual(out.sessions.filter((s) => s.week <= 5), plan.sessions.filter((s) => s.week <= 5));
});

test('unwell rewrites the window and the ramp, never the race or what is done', () => {
  const now = START + 7 * DAY + 3600e3; // Monday of week 2
  const done = plan.sessions.find((s) => s.date >= now);
  const m = new Map([[done.id, run(done, 1)]]);
  const span = (p, a, b) => p.sessions.filter((s) => s.date >= START + a * DAY && s.date < START + b * DAY);
  const rest = unwell(plan, { days: 7, mode: 'rest', ramp: 'slow' }, now, m);
  assert.ok(span(rest, 7, 14).every((s) => s === done || s.status === 'skipped'));
  const ramp = span(rest, 14, 21); // first slow week: every run easy at 70 %
  assert.ok(ramp.every((s) => s.type === 'easy' || s.type === 'long'));
  assert.equal(rest.adjustments.at(-1).kind, 'unwell');
  const short = unwell(plan, { days: 7, mode: 'shorter', ramp: 'fast' }, now);
  for (const s of span(short, 7, 14)) {
    assert.ok(s.type === 'easy' || s.type === 'long');
    assert.ok(s.distance <= plan.sessions.find((x) => x.id === s.id).distance * 0.6 + 3000);
  }
  assert.ok(span(short, 14, 21).some((s) => isHard(s.type) && s.type !== 'long')); // quality back after a week
  const race = plan.sessions.at(-1);
  const late = unwell(plan, { days: 14, mode: 'rest', ramp: 'slow' }, race.date - 3 * DAY);
  assert.deepEqual(late.sessions.at(-1), race);
});

test('regenerate keeps past weeks and plans the rest to the new race date', () => {
  const now = START + 4 * 7 * DAY + DAY; // week 5
  const raceDate = plan.goal.date + 14 * DAY;
  const out = regenerate(plan, { raceDate, vdot: 47, weekly: 40000 }, now);
  assert.equal(out.weeks.length, plan.weeks.length + 2);
  assert.equal(out.goal.date, raceDate);
  assert.equal(out.vdot, 47);
  assert.deepEqual(out.weeks.slice(0, 5), plan.weeks.slice(0, 5));
  assert.deepEqual(out.sessions.filter((s) => s.week <= 5), plan.sessions.filter((s) => s.week <= 5));
  assert.equal(out.sessions.at(-1).type, 'race');
  assert.equal(new Set(out.sessions.map((s) => s.id)).size, out.sessions.length);
  assert.equal(weekOf(out, earliestRace(plan, now)), 5 + 1 + 3); // next week, then the 3 taper weeks
  assert.equal(regenerate(plan, { raceDate, vdot: plan.vdot, weekly: 40000 }, now).vdotHistory, plan.vdotHistory);
});
