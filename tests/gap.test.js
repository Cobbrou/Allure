import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/lib/analyze.js';
import { gradeFactor } from '../src/lib/gap.js';

/** Straight 2 km at 5:00/km, one point every 10 m, climbing `grade` (rise / run). */
const slope = (grade) =>
  analyze(Array.from({ length: 201 }, (_, i) => ({ lat: 45 + (i * 10) / 111195, lon: 6, ele: 100 + i * 10 * grade, time: i * 3000 })));

test('gradeFactor: flat is 1, uphill costs more, gentle downhill less', () => {
  assert.equal(gradeFactor(0), 1);
  assert.ok(gradeFactor(0.1) > 1.4 && gradeFactor(0.1) < 1.7, gradeFactor(0.1));
  assert.ok(gradeFactor(-0.1) > 0.75 && gradeFactor(-0.1) < 0.9, gradeFactor(-0.1));
  assert.ok(gradeFactor(-0.4) > gradeFactor(-0.2), 'steep downhill brakes again');
  assert.equal(gradeFactor(2), gradeFactor(0.45));
});

test('GAP equals pace on flat, is faster uphill and slower downhill', () => {
  const flat = slope(0), up = slope(0.08), down = slope(-0.08);
  assert.ok(Math.abs(flat.gap - flat.avgPace) < 0.5);
  assert.ok(Math.abs(flat.avgPace - 300) < 1);
  assert.ok(up.gap < 250, `up ${up.gap}`);
  assert.ok(down.gap > 330, `down ${down.gap}`);
  assert.ok(up.splits.every((s) => s.gap < s.pace));
});

test('GAP is null without elevation', () => {
  const a = analyze([{ lat: 45, lon: 6, time: 0 }, { lat: 45.001, lon: 6, time: 30e3 }]);
  assert.equal(a.gap, null);
  assert.equal(a.splits[0].gap, null);
});
