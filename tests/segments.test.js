import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/lib/analyze.js';
import { createSegment, findEfforts, leaderboard, segmentEfforts } from '../src/lib/segments.js';

const M = 0.000009; // ≈ 1 m of latitude in degrees
// Straight line north from (45, 6): one fix every 5 m at `speed` m/s, starting `t0` ms.
const line = (meters, { speed = 5, t0 = 0, lon = 6, lat0 = 45 } = {}) =>
  Array.from({ length: meters / 5 + 1 }, (_, i) => ({ lat: lat0 + i * 5 * M, lon, ele: i, time: t0 + (i * 5 / speed) * 1000, hr: null }));

// Segment over meters 200..600 of a 1 km line.
const base = analyze(line(1000)).track;
const seg = createSegment({ name: 'Bosse', sport: 'run', track: base, from: 40, to: 120 });

test('createSegment measures distance and climb', () => {
  assert.ok(Math.abs(seg.distance - 400) < 2);
  assert.ok(seg.gain > 70 && seg.gain < 90);
  assert.ok(seg.grade > 15 && seg.grade < 25);
  assert.ok(seg.points.length > 30);
});

test('an activity on the same road gets one effort, timed start to end', () => {
  const efforts = findEfforts(seg, line(1000, { speed: 4 }));
  assert.equal(efforts.length, 1);
  assert.ok(Math.abs(efforts[0].time - 100) <= 2); // 400 m at 4 m/s
  assert.equal(efforts[0].seg, seg.id);
});

test('a GPS offset within tolerance still matches, a parallel street does not', () => {
  assert.equal(findEfforts(seg, line(1000, { lon: 6 + 0.0002 })).length, 1); // ~16 m east
  assert.equal(findEfforts(seg, line(1000, { lon: 6 + 0.001 })).length, 0); // ~80 m east
});

test('partial pass, wrong direction or no timestamps: no effort', () => {
  assert.equal(findEfforts(seg, line(400)).length, 0); // stops at 400 m, before the segment end
  assert.equal(findEfforts(seg, line(1000).reverse()).length, 0);
  assert.equal(findEfforts(seg, line(1000).map((p) => ({ ...p, time: null }))).length, 0);
});

test('two laps give two efforts', () => {
  const lap1 = line(1000);
  const back = line(1000, { t0: lap1.at(-1).time + 1000 }).reverse().map((p, i) => ({ ...p, time: lap1.at(-1).time + 1000 + i * 1000 }));
  const lap2 = line(1000, { t0: back.at(-1).time + 1000, speed: 2 });
  const efforts = findEfforts(seg, [...lap1, ...back, ...lap2]);
  assert.equal(efforts.length, 2);
  assert.ok(efforts[1].time > efforts[0].time);
});

test('segmentEfforts filters by sport, leaderboard ranks fastest first', () => {
  assert.equal(segmentEfforts([seg], 'ride', line(1000)).length, 0);
  const slow = { id: 'a', sport: 'run', efforts: [{ seg: seg.id, time: 120 }] };
  const fast = { id: 'b', sport: 'run', efforts: [{ seg: seg.id, time: 90 }, { seg: 'other', time: 10 }] };
  const ride = { id: 'c', sport: 'ride', efforts: [{ seg: seg.id, time: 30 }] };
  assert.deepEqual(leaderboard(seg, [slow, fast, ride, { id: 'd', sport: 'run' }]).map((e) => e.meta.id), ['b', 'a']);
});

test('passing the start, wandering off and coming back starts the effort on the last pass', () => {
  // Through the segment start (200 m) heading south, 100 m out and back, then north over the segment.
  const south = line(1000).slice(20, 41).reverse(); // 200 m -> 100 m
  const back = line(1000).slice(20); // 100 m -> 1000 m
  const pts = [...line(1000).slice(41, 50).reverse(), ...south, ...back].map((p, i) => ({ ...p, time: i * 1000 }));
  const efforts = findEfforts(seg, pts);
  assert.equal(efforts.length, 1);
  assert.ok(Math.abs(efforts[0].time - 80) <= 2, `got ${efforts[0].time}`); // 400 m at 5 m per fix
});
