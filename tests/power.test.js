import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestCurve, estimateFtp, normalizedPower, powerCurve, powerSeries, powerStats, trainingStress } from '../src/lib/power.js';

/** One point per second with the given watts. */
const ride = (watts, t0 = 0) => watts.map((power, i) => ({ lat: 45, lon: 6, time: t0 + i * 1000, power }));
const steady = (w, s) => Array(s).fill(w);

test('powerSeries holds samples per second and drops pauses', () => {
  const pts = [{ time: 0, power: 100 }, { time: 3000, power: 200 }, { time: 4000, power: 300 }, { time: 60000, power: 0 }, { time: 61000, power: 0 }];
  assert.deepEqual(powerSeries(pts), [100, 100, 100, 200, 0]);
  assert.equal(powerSeries([{ time: 0 }, { time: 1000 }]), null);
});

test('powerCurve finds the best average for each duration', () => {
  const s = [...steady(150, 300), ...steady(400, 60), ...steady(150, 300)];
  const c = powerCurve(s);
  assert.equal(c[5], 400);
  assert.equal(c[60], 400);
  assert.equal(c[120], 275); // 60 s at 400 + 60 s at 150
  assert.equal(c[1200], undefined); // series shorter than 20 min
});

test('normalizedPower equals average power when steady, exceeds it when surging', () => {
  assert.equal(normalizedPower(steady(200, 600)), 200);
  const surges = Array.from({ length: 20 }, () => [...steady(400, 30), ...steady(100, 30)]).flat();
  assert.ok(normalizedPower(surges) > 280, normalizedPower(surges)); // average is 250
});

test('powerStats, FTP estimate and training stress', () => {
  const now = 100 * 86400e3;
  const hard = { date: now - 86400e3, ...powerStats(ride(steady(250, 1300))) };
  const old = { date: now - 200 * 86400e3, ...powerStats(ride(steady(320, 1300))) };
  assert.equal(hard.avgPower, 250);
  assert.equal(bestCurve([hard, old])[1200], 320);
  assert.equal(estimateFtp([hard, old], now), 238); // old ride is outside the 90-day window
  const s = trainingStress(238, 3600, 238);
  assert.equal(s.tss, 100); // an hour at FTP
  assert.deepEqual(powerStats(ride([null, null])), {});
});
