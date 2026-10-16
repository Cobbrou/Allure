import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/lib/analyze.js';
import { demoTrack } from '../src/lib/demo.js';
import { fmtDuration, fmtPace } from '../src/lib/format.js';

test('demo track yields a realistic 10 km run', () => {
  const a = analyze(demoTrack());
  assert.ok(Math.abs(a.distance - 10000) < 50, `distance ${a.distance}`);
  assert.equal(a.splits.length, 10);
  assert.ok(a.gain > 150 && a.gain < 400, `gain ${a.gain}`);
  assert.ok(a.avgPace > 240 && a.avgPace < 420, `pace ${a.avgPace}`);
  assert.ok(a.avgHr > 120 && a.avgHr < 185, `hr ${a.avgHr}`);
  assert.ok(Math.abs(a.splits.reduce((s, x) => s + x.time, 0) - a.movingTime) < 1);
});

test('pauses are excluded from moving time', () => {
  const p = [{ lat: 0, lon: 0, time: 0 }, { lat: 0.0009, lon: 0, time: 30e3 }, { lat: 0.0018, lon: 0, time: 630e3 }];
  const a = analyze(p);
  assert.equal(a.movingTime, 30);
  assert.equal(a.gain, null);
});

test('formatters', () => {
  assert.equal(fmtDuration(3723), '1:02:03');
  assert.equal(fmtDuration(332), '5:32');
  assert.equal(fmtPace(299.6), '5:00');
});
