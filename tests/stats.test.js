import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/lib/analyze.js';
import { bestEfforts, biggestActivities, effortDistances, personalRecords, RIDE_DISTANCES } from '../src/lib/records.js';
import { byDay, monthGrid, periodStart, setWeekStart, startOfWeek, totals, filterActivities, forTraining, trainingWeeks, weekdayInitials, weeklyDistance, yearToDate } from '../src/lib/stats.js';

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

test('weeks can start on Sunday', () => {
  setWeekStart(0);
  try {
    assert.equal(startOfWeek(new Date(2026, 9, 14, 18).getTime()), new Date(2026, 9, 11).getTime());
    assert.equal(startOfWeek(new Date(2026, 9, 11, 8).getTime()), new Date(2026, 9, 11).getTime());
    assert.equal(monthGrid(2026, 9)[0].filter((d) => d === null).length, 4);
    assert.equal(weekdayInitials()[0], 'D'); // dimanche
  } finally { setWeekStart(1); }
  assert.equal(weekdayInitials()[0], 'L');
});

test('predictRaces: Riegel from recent runs, ignoring short efforts for long races', async () => {
  const { predictRaces } = await import('../src/lib/records.js');
  const now = Date.parse('2026-10-17T12:00:00Z');
  const day = 86400e3;
  const metas = [
    { id: 'a', sport: 'run', date: now - 10 * day, distance: 10000, movingTime: 3000, bestEfforts: { '1k': 240, '5k': 1450, '10k': 3000 } },
    { id: 'old', sport: 'run', date: now - 200 * day, distance: 5000, movingTime: 1000, bestEfforts: { '1k': 190, '5k': 1000 } },
    { id: 'ride', sport: 'ride', date: now - day, distance: 40000, movingTime: 3600, bestEfforts: {} },
  ];
  const p = Object.fromEntries(predictRaces(metas, now).map((r) => [r.id, r]));
  assert.equal(p['5k'].time, Math.round(3000 * 0.5 ** 1.06)); // 10 km scaled down beats the own 5 km; 1 km too short
  assert.equal(p['10k'].time, 3000);
  assert.equal(p.half.time, Math.round(3000 * 2.10975 ** 1.06));
  assert.equal(p.half.from.activity.id, 'a');
  assert.equal(p.marathon.time, undefined); // nothing recent covers a quarter of a marathon
  assert.equal(predictRaces([], now)[0].time, undefined);
});

test('trainingWeeks puts activities on their weekday, newest week first', () => {
  const now = new Date(2026, 9, 14, 18).getTime(); // Wednesday
  const metas = [
    { id: 'a', sport: 'run', date: new Date(2026, 9, 13, 8).getTime(), distance: 10000, movingTime: 3000, gain: 0 },
    { id: 'b', sport: 'ride', date: new Date(2026, 9, 13, 18).getTime(), distance: 40000, movingTime: 5000, gain: 0 },
    { id: 'c', sport: 'run', date: new Date(2026, 9, 11, 8).getTime(), distance: 8000, movingTime: 2400, gain: 0 },
  ];
  const [w0, w1] = trainingWeeks(metas, 2, now);
  assert.equal(w0.start, new Date(2026, 9, 12).getTime());
  assert.deepEqual(w0.days.map((d) => d.map((a) => a.id)), [[], ['a', 'b'], [], [], [], [], []]);
  assert.equal(w0.totals.distance, 50000);
  assert.deepEqual(w1.days[6].map((a) => a.id), ['c']); // Sunday 11 Oct
  assert.equal(trainingWeeks(metas, 1, now, 'run')[0].totals.count, 1);
});

test('personalRecords per sport and per calendar year', () => {
  const d = (y) => new Date(y, 5, 1).getTime();
  const metas = [
    { id: 'old', sport: 'run', date: d(2025), bestEfforts: { '1k': 240 } },
    { id: 'new', sport: 'run', date: d(2026), bestEfforts: { '1k': 260 } },
    { id: 'r', sport: 'ride', date: d(2026), bestEfforts: { '20k': 2400 } },
  ];
  assert.equal(personalRecords(metas)[0].activity.id, 'old');
  assert.equal(personalRecords(metas, { year: 2026 })[0].activity.id, 'new');
  const [k20, k40] = personalRecords(metas, { sport: 'ride' });
  assert.deepEqual([k20.id, k20.time, k40.time], ['20k', 2400, undefined]);
  assert.deepEqual(personalRecords(metas, { sport: 'swim' }), []);
});

test('effortDistances: runs and trail runs, every kind of ride, nothing else', () => {
  assert.equal(effortDistances('trail')[0].id, '1k');
  assert.equal(effortDistances('gravel'), RIDE_DISTANCES);
  assert.deepEqual(effortDistances('hike'), []);
});

test('bestEfforts over ride distances', () => {
  const be = bestEfforts(steadyRun(41, 90), RIDE_DISTANCES); // 40 km/h
  assert.ok(Math.abs(be['20k'] - 1800) <= 3, be['20k']);
  assert.ok(Math.abs(be['40k'] - 3600) <= 4, be['40k']);
  assert.equal(be['100k'], undefined);
});

test('biggestActivities: longest, biggest climb and longest time of a sport, records exclusions left out', () => {
  const metas = [
    { id: 'a', sport: 'hike', date: 0, distance: 20000, gain: 300, movingTime: 9000 },
    { id: 'b', sport: 'hike', date: 0, distance: 12000, gain: 1200, movingTime: 9500 },
    { id: 'c', sport: 'hike', date: 0, distance: 50000, gain: 3000, movingTime: 20000, noRecords: true },
    { id: 'd', sport: 'run', date: 0, distance: 42000, gain: 0, movingTime: 12000 },
  ];
  const b = biggestActivities(metas, { sport: 'hike' });
  assert.deepEqual([b.distance.id, b.gain.id, b.movingTime.id], ['a', 'b', 'b']);
  assert.equal(biggestActivities(metas, { sport: 'run' }).gain, undefined);
});

test('yearToDate compares with last year up to the same date', () => {
  const now = new Date(2026, 9, 22, 12).getTime();
  const at = (y, m, day) => ({ sport: 'run', date: new Date(y, m, day, 8).getTime(), distance: 1000, movingTime: 300, gain: 10 });
  const metas = [at(2026, 0, 5), at(2026, 9, 22), at(2025, 0, 5), at(2025, 9, 22), at(2025, 9, 23), at(2024, 5, 1)];
  const { current, last } = yearToDate(metas, now);
  assert.equal(current.count, 2);
  assert.equal(last.count, 2);
});

test('commutes: feed filter both ways, left out of training only on request', () => {
  const metas = [{ id: 'a', name: 'Boulot', sport: 'ride', date: 0, distance: 8000, commute: true }, { id: 'b', name: 'Col', sport: 'ride', date: 0, distance: 60000 }];
  const ids = (l) => l.map((a) => a.id);
  assert.deepEqual(ids(filterActivities(metas, { commute: true })), ['a']);
  assert.deepEqual(ids(filterActivities(metas, { commute: false })), ['b']);
  assert.deepEqual(ids(filterActivities(metas, {})), ['a', 'b']);
  assert.deepEqual(ids(forTraining(metas, true)), ['b']);
  assert.equal(forTraining(metas, false), metas);
});
