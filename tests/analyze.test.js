import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, computeSplits } from '../src/lib/analyze.js';
import { demoTrack } from '../src/lib/demo.js';
import { fmtDuration, fmtPace } from '../src/lib/format.js';

test('demo track yields a realistic 10 km run', () => {
  const a = analyze(demoTrack());
  assert.ok(Math.abs(a.distance - 10000) < 50, `distance ${a.distance}`);
  assert.equal(computeSplits(a.track).length, 10);
  assert.ok(a.gain > 150 && a.gain < 400, `gain ${a.gain}`);
  assert.ok(a.avgPace > 240 && a.avgPace < 420, `pace ${a.avgPace}`);
  assert.ok(a.avgHr > 120 && a.avgHr < 185, `hr ${a.avgHr}`);
  assert.ok(Math.abs(computeSplits(a.track).reduce((s, x) => s + x.time, 0) - a.movingTime) < 1);
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

test('computeSplits supports custom split sizes', () => {
  const a = analyze(demoTrack());
  const five = computeSplits(a.track, 5000);
  assert.equal(five.length, 2);
  assert.ok(Math.abs(five.reduce((s, x) => s + x.time, 0) - a.movingTime) < 1);
  assert.equal(computeSplits(a.track, 100).length, 100);
});

test('moving threshold depends on the sport', () => {
  // A steep climb on foot: 0.3 m/s horizontal, 3 s between points.
  const climb = Array.from({ length: 101 }, (_, i) => ({ lat: 45 + (i * 0.9) / 111195, lon: 6, time: i * 3000 }));
  assert.equal(analyze(climb, 'run').movingTime, 0);
  assert.equal(analyze(climb, 'hike').movingTime, 300);
  assert.equal(computeSplits(analyze(climb, 'hike').track, 50, 'hike')[0].time > 0, true);
  assert.equal(analyze(climb).movingTime, 0); // no sport: run threshold
});
