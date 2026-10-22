import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Decoder, Stream } from '@garmin/fitsdk';
import { briefing } from '../src/lib/briefing.js';
import { workoutFit } from '../src/lib/formats/fitWorkout.js';
import { heatSlowdown, trainingPaces } from '../src/lib/paces.js';
import { defaultRaceDate, evenSplits, generatePlan, planRecap, reminderList, sessionWorkout, usualHour } from '../src/lib/plan.js';
import { hourAt } from '../src/lib/weather.js';
import { startWorkout } from '../src/lib/workout.js';

const DAY = 86400e3;
const START = new Date(2026, 10, 2).getTime(); // a Monday
const race = generatePlan({ goal: '10k', start: START, raceDate: defaultRaceDate('10k', START, 0), vdot: 45, weekly: 25000, runs: 4, days: [0, 2, 4, 6], longDay: 0, experience: 'intermediate' }, 1);
const start = generatePlan({ goal: 'start', start: START, days: [1, 3, 6], longDay: 1, runs: 3, weeks: 9, level: 0 }, 1);

test('briefing: a why and a focus for every session type, week notes', () => {
  for (const plan of [race, start]) {
    for (const s of plan.sessions) {
      const b = briefing(s, plan);
      assert.ok(b.why && b.focus && !/undefined|\{/.test(b.why + b.focus), `${s.type}: ${b.why} ${b.focus}`);
    }
  }
  const recovery = race.sessions.find((s) => race.weeks[s.week - 1].kind === 'recovery');
  assert.ok(briefing(recovery, race).note);
  assert.match(briefing(start.sessions[0], start).why, /8 × 1:00/);
});

test('heatSlowdown: nothing when cool, interpolated, too hot past 180 °F', () => {
  assert.deepEqual(heatSlowdown(15, 5), { factor: 0, hot: false }); // 59 + 41 = 100 °F
  const warm = heatSlowdown(25, 18); // 77 + 64.4 = 141.4 °F
  assert.ok(warm.factor > 0.03 && warm.factor < 0.045, String(warm.factor));
  assert.deepEqual(heatSlowdown(38, 28), { factor: 0.1, hot: true });
  assert.ok(heatSlowdown(30, 20).factor > heatSlowdown(30, 10).factor);
});

test('startWorkout slows pace ranges on a hot day', () => {
  const s = race.sessions.find((x) => x.type === 'intervals');
  const normal = startWorkout(sessionWorkout(s), 45), hot = startWorkout(sessionWorkout({ ...s, heat: { factor: 0.05 } }), 45);
  const i = normal.steps.findIndex((x) => x.target?.range);
  assert.deepEqual(hot.steps[i].target.range, normal.steps[i].target.range.map((p) => Math.round(p * 1.05)));
});

test('evenSplits: one per km and the finish', () => {
  const s = evenSplits(2400, 10000, 1000);
  assert.equal(s.length, 10);
  assert.deepEqual(s[0], { dist: 1000, time: 240 });
  assert.deepEqual(s.at(-1), { dist: 10000, time: 2400 });
  assert.deepEqual(evenSplits(6000, 21097.5, 1000).at(-2).dist, 21000);
});

test('usualHour: median start hour of recent runs, 8 without any', () => {
  const at = (h, d) => ({ sport: 'run', date: new Date(2026, 9, d, h).getTime() });
  const now = new Date(2026, 9, 30).getTime();
  assert.equal(usualHour([at(7, 1), at(18, 3), at(18, 5)], now), 18);
  assert.equal(usualHour([], now), 8);
});

test('planRecap counts runs matched to sessions and the race result', () => {
  const r = race.sessions.find((s) => s.type === 'race'), e = race.sessions[0];
  const matches = new Map([[e.id, { id: 'a', distance: 8000, movingTime: 2700 }], [r.id, { id: 'b', distance: 10050, movingTime: 2500, bestEfforts: { '10k': 2480 } }]]);
  const out = planRecap(race, matches);
  assert.equal(out.done, 2);
  assert.equal(out.distance, 18050);
  assert.equal(out.race.time, 2480);
  assert.equal(out.vdotFrom, 45);
});

test('reminderList: open sessions of the next 14 days, at the hour, not past', () => {
  const now = START + 2 * DAY + 10 * 3600e3; // Wednesday 10:00
  const list = reminderList(start, now, 7, new Map());
  assert.ok(list.length > 0 && list.every((r) => r.at > now && r.at < now + 15 * DAY));
  assert.ok(list.every((r) => new Date(r.at).getHours() === 7));
  const skipped = { ...start, sessions: start.sessions.map((s) => (s.id === list[0].session.id ? { ...s, status: 'skipped' } : s)) };
  assert.equal(reminderList(skipped, now, 7).length, list.length - 1);
});

test('workoutFit: a FIT workout with speed targets the decoder reads back', () => {
  const s = race.sessions.find((x) => x.type === 'intervals');
  const w = startWorkout(sessionWorkout(s), 45);
  const { messages, errors } = new Decoder(Stream.fromByteArray(workoutFit(w, START))).read();
  assert.deepEqual(errors, []);
  assert.equal(messages.fileIdMesgs[0].type, 'workout');
  assert.equal(messages.workoutMesgs[0].numValidSteps, w.steps.length);
  const steps = messages.workoutStepMesgs;
  assert.equal(steps.length, w.steps.length);
  const k = w.steps.findIndex((x) => x.kind === 'work');
  const pace = trainingPaces(45).interval;
  assert.equal(steps[k].durationDistance, 1000);
  assert.equal(steps[k].targetType, 'speed');
  assert.ok(Math.abs(steps[k].customTargetSpeedHigh - 1000 / pace[0]) < 0.01);
  assert.equal(steps[0].durationTime, 900);
  assert.equal(steps[0].intensity, 'warmup');
  // Effort-only steps: open target, RPE in the name.
  const walk = startWorkout(sessionWorkout(start.sessions[0]), null);
  const back = new Decoder(Stream.fromByteArray(workoutFit(walk))).read().messages.workoutStepMesgs;
  assert.equal(back[1].targetType, 'open');
  assert.match(back[1].wktStepName, /RPE 3/);
});

test('hourAt: closest forecast hour, null out of range', () => {
  const hours = [0, 1, 2].map((h) => ({ time: START + h * 3600e3, temp: 10 + h, dew: 5 }));
  assert.equal(hourAt(hours, START + 1.4 * 3600e3).temp, 11);
  assert.equal(hourAt(hours, START + 5 * 3600e3), null);
});
