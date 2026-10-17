import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActivity } from '../src/lib/activity.js';
import { demoTrack } from '../src/lib/demo.js';
import { estimateMaxHr, fitnessSeries, hrTime, relativeEffort, timeInZones } from '../src/lib/training.js';

const HR = { max: 190, rest: 60 };
/** `min` minutes at a constant heart rate, one point per second. */
const steady = (bpm, min) => ({ [bpm]: min * 60 });

test('hrTime histograms moving seconds per bpm, skipping pauses', () => {
  const pts = [{ time: 0, hr: 120 }, { time: 1000, hr: 120 }, { time: 3000, hr: 150.4 }, { time: 300_000, hr: 150 }];
  assert.deepEqual(hrTime(pts), { 120: 1, 150: 2 });
  assert.deepEqual(hrTime([{ time: 0 }, { time: 1000 }]), {});
});

test('timeInZones splits by % of max HR', () => {
  const z = timeInZones({ 100: 10, 114: 20, 133: 30, 152: 40, 171: 50, 200: 5 }, 190);
  assert.deepEqual(z, [10, 20, 30, 40, 55]);
});

test('relativeEffort grows with intensity and duration', () => {
  const easy = relativeEffort(steady(130, 60), HR);
  const hard = relativeEffort(steady(170, 60), HR);
  assert.ok(easy > 40 && easy < 120, `easy ${easy}`);
  assert.ok(hard > 2 * easy, `hard ${hard}`);
  assert.ok(Math.abs(relativeEffort(steady(130, 120), HR) - 2 * easy) <= 1);
  assert.equal(relativeEffort({}, HR), null);
});

test('estimateMaxHr ignores spikes shorter than 60 s', () => {
  assert.equal(estimateMaxHr([{ hrTime: { 150: 600, 181: 50, 205: 20 } }, { hrTime: { 175: 30 } }]), 181);
  assert.equal(estimateMaxHr([{}]), 190);
});

test('fitnessSeries: daily training builds fitness, rest restores form', () => {
  const day = 86400e3;
  const now = new Date(2026, 5, 30, 20).getTime();
  const acts = Array.from({ length: 30 }, (_, i) => ({ date: now - (40 - i) * day, hrTime: steady(150, 60) }));
  const s = fitnessSeries(acts, HR, 60, now);
  assert.equal(s.length, 60);
  assert.equal(new Date(s.at(-1).date).getDate(), 30);
  const lastTraining = s.findLast((d) => d.load > 0);
  const end = s.at(-1);
  assert.ok(lastTraining.form < 0, 'tired while training');
  assert.ok(end.form > 0 && end.fitness < lastTraining.fitness, 'fresher after rest');
});

test('createActivity stores hrTime for demo tracks', () => {
  const { meta } = createActivity({ points: demoTrack({ km: 5 }) });
  const total = Object.values(meta.hrTime).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - meta.movingTime) < 5, `${total} vs ${meta.movingTime}`);
});
