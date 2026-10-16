import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/lib/analyze.js';
import { bestEfforts, personalRecords } from '../src/lib/records.js';
import { byDay, monthGrid, periodStart, startOfWeek, totals, weeklyDistance } from '../src/lib/stats.js';

/** Straight track at constant speed: `km` long, `pace` s/km, one point every 10 m. */
const steadyRun = (km, pace) =>
  analyze(Array.from({ length: km * 100 + 1 }, (_, i) => ({ lat: 45 + (i * 10) / 111195, lon: 6, time: i * pace * 10 }))).track;

test('bestEfforts on a steady 12 km run', () => {
  const be = bestEfforts(steadyRun(12, 300));
  assert.ok(Math.abs(be['1k'] - 300) <= 1, be['1k']);
  assert.ok(Math.abs(be['5k'] - 1500) <= 2, be['5k']);
  assert.ok(Math.abs(be['10k'] - 3000) <= 3, be['10k']);
  assert.equal(be.half, undefined);
});

test('bestEfforts finds the fast kilometre inside a slow run', () => {
  // 3 km at 6:00/km, then 1 km at 4:00/km, then 1 km at 6:00/km.
  const pts = [];
  let t = 0;
  for (let i = 0; i <= 500; i++) {
    if (i) t += (i > 300 && i <= 400 ? 240 : 360) * 10; // ms per 10 m
    pts.push({ lat: 45 + (i * 10) / 111195, lon: 6, time: t });
  }
  const be = bestEfforts(analyze(pts).track);
  assert.ok(Math.abs(be['1k'] - 240) <= 2, be['1k']);
});

test('personalRecords keeps the fastest run only', () => {
  const metas = [
    { id: 'a', sport: 'run', bestEfforts: { '1k': 280, '5k': 1500 } },
    { id: 'b', sport: 'run', bestEfforts: { '1k': 270 } },
    { id: 'c', sport: 'ride', bestEfforts: { '1k': 90 } },
  ];
  const [k1, k5, k10] = personalRecords(metas);
  assert.deepEqual([k1.time, k1.activity.id], [270, 'b']);
  assert.deepEqual([k5.time, k5.activity.id], [1500, 'a']);
  assert.equal(k10.time, undefined);
});

test('weeks start on Monday and periods are local', () => {
  const wed = new Date(2026, 9, 14, 18).getTime(); // Wednesday 14 Oct 2026
  assert.equal(startOfWeek(wed), new Date(2026, 9, 12).getTime());
  assert.equal(periodStart('month', wed), new Date(2026, 9, 1).getTime());
  assert.equal(periodStart('year', wed), new Date(2026, 0, 1).getTime());
});

test('totals, weekly distance and day grouping', () => {
  const now = new Date(2026, 9, 14, 18).getTime();
  const metas = [
    { sport: 'run', date: new Date(2026, 9, 13, 8).getTime(), distance: 10000, movingTime: 3000, gain: 100 },
    { sport: 'ride', date: new Date(2026, 9, 13, 18).getTime(), distance: 40000, movingTime: 5000, gain: 300 },
    { sport: 'run', date: new Date(2026, 9, 6, 8).getTime(), distance: 8000, movingTime: 2400, gain: 50 },
  ];
  assert.deepEqual(totals(metas, { from: periodStart('week', now), sport: 'run' }), { count: 1, distance: 10000, movingTime: 3000, gain: 100 });
  assert.equal(totals(metas).count, 3);
  const weeks = weeklyDistance(metas, now, 3);
  assert.deepEqual(weeks.map((w) => w.distance), [0, 8000, 50000]);
  assert.equal(byDay(metas).get(new Date(2026, 9, 13).getTime()).length, 2);
});

test('monthGrid pads to whole Monday-first weeks', () => {
  const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.deepEqual(grid[0].slice(0, 3), [null, null, null]);
  assert.equal(new Date(grid[0][3]).getDate(), 1);
  assert.ok(grid.every((w) => w.length === 7));
  assert.equal(grid.flat().filter(Boolean).length, 31);
});
