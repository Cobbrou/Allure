import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fmtDist, fmtElev, fmtLength, fmtPaceUnit, fmtSpeed, setUnits } from '../src/lib/format.js';
import { fmtGoalValue, METRICS } from '../src/lib/goals.js';
import { splitCue, startRecording } from '../src/lib/recorder.js';
import { effort, splitSize } from '../src/lib/sports.js';

afterEach(() => setUnits('metric'));

test('metric display is unchanged', () => {
  assert.equal(fmtDist(12345), '12.35');
  assert.equal(fmtElev(812.4), '812');
  assert.equal(fmtLength(847), '850 m');
  assert.equal(fmtPaceUnit(300), '5:00');
  assert.equal(fmtSpeed(120), '30.0');
  assert.equal(splitSize('ride'), 5000);
});

test('imperial converts distance, elevation, pace, speed and splits', () => {
  setUnits('imperial');
  assert.equal(fmtDist(1609.344), '1.00');
  assert.equal(fmtElev(304.8), '1000');
  assert.equal(fmtLength(91.44), '100 yd');
  assert.equal(fmtPaceUnit(300), '8:03'); // 5:00 /km
  assert.equal(fmtSpeed(120), '18.6'); // 30 km/h
  assert.deepEqual(effort('swim', 1000), { label: 'Allure moyenne', short: 'Allure', value: '1:31', unit: '/100yd' });
  assert.equal(splitSize('run'), 1609.344);
  assert.equal(splitSize('swim'), 91.44);
});

test('imperial goals and spoken splits', () => {
  setUnits('imperial');
  assert.equal(METRICS.distance.unit, 'mi');
  assert.equal(fmtGoalValue('distance', Math.round(30 * METRICS.distance.scale)), '30');
  const r = startRecording({}, 0);
  assert.equal(splitCue({ ...r, distance: 1600 }, { ...r, distance: 1610, active: 480_000, runningSince: null }, 0),
    '1 mile. Allure moyenne 8 minutes 0.');
});
