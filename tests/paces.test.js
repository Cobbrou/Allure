import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentVdot, raceTime, timeInPaceZones, trainingPaces, vdot } from '../src/lib/paces.js';

const hms = (h, m, s) => h * 3600 + m * 60 + s;
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected}`);

// Rows of Daniels' published VDOT table: 5 km, 10 km, half, marathon.
const TABLE = {
  40: [hms(0, 24, 8), hms(0, 50, 3), hms(1, 50, 59), hms(3, 49, 45)],
  50: [hms(0, 19, 57), hms(0, 41, 21), hms(1, 31, 35), hms(3, 10, 49)],
  60: [hms(0, 17, 3), hms(0, 35, 22), hms(1, 18, 9), hms(2, 43, 25)],
};
const DISTANCES = [5000, 10000, 21097.5, 42195];

test('vdot and raceTime match the VDOT table', () => {
  for (const [v, times] of Object.entries(TABLE)) {
    DISTANCES.forEach((d, i) => {
      near(raceTime(Number(v), d), times[i], 10, `VDOT ${v} over ${d} m`);
      near(vdot(d, times[i]), Number(v), 0.2, `VDOT of ${times[i]} s over ${d} m`);
    });
  }
});

test('trainingPaces match the table and are ordered', () => {
  const mid = ([a, b]) => (a + b) / 2;
  // [threshold, interval] s/km from the table.
  for (const [v, [tp, ip]] of Object.entries({ 40: [306, 282], 50: [255, 235], 60: [220, 204] })) {
    const p = trainingPaces(Number(v));
    near(mid(p.threshold), tp, 3, `T at ${v}`);
    near(mid(p.interval), ip, 3, `I at ${v}`);
    near(mid(p.marathon), TABLE[v][3] / 42.195, 1, `M at ${v}`);
    const order = [p.easy, p.marathon, p.threshold, p.interval, p.repetition].map(mid);
    assert.deepEqual(order, [...order].sort((a, b) => b - a), `slowest first at ${v}`);
    assert.ok(p.easy[0] < p.easy[1]);
  }
});

test('currentVdot takes the best effort of 3 km or more in the window', () => {
  const now = Date.UTC(2026, 9, 1);
  const day = 86400e3;
  const runs = [
    { id: 'a', sport: 'run', date: now - 10 * day, distance: 10000, movingTime: 2481, bestEfforts: { '1k': 200, '5k': 1197 } },
    { id: 'b', sport: 'run', date: now - 20 * day, distance: 8000, movingTime: 2700 },
    { id: 'old', sport: 'run', date: now - 200 * day, distance: 5000, movingTime: 1023 },
    { id: 'ride', sport: 'ride', date: now - day, distance: 40000, movingTime: 3600 },
  ];
  const best = currentVdot(runs, now);
  assert.equal(best.activity.id, 'a');
  near(best.vdot, 50, 0.2, 'vdot');
  assert.ok(best.distance >= 3000, 'the 1 km effort is not used while longer ones exist');
  assert.equal(currentVdot(runs.slice(2), now), null);
  // Only short efforts: used anyway.
  const short = currentVdot([{ sport: 'run', date: now, distance: 2000, movingTime: 480, bestEfforts: { '1k': 230 } }], now);
  assert.equal(short.distance, 2000);
});

test('timeInPaceZones buckets ~10 s chunks of moving time', () => {
  const p = trainingPaces(50);
  const track = [];
  let time = 0, dist = 0;
  const run = (secs, pace) => { for (let i = 0; i < secs; i++) { time += 1000; dist += 1000 / pace; track.push({ time, dist }); } };
  track.push({ time, dist });
  run(600, 320); // easy
  run(300, 255); // threshold
  time += 120e3; track.push({ time, dist }); // pause
  run(120, 235); // interval
  run(60, 3600); // walking: under the moving threshold
  const z = timeInPaceZones(track, p);
  near(z[0], 600, 10, 'easy');
  near(z[2], 300, 10, 'threshold');
  near(z[3], 120, 10, 'interval');
  assert.equal(z[1] + z[4], 0);
});
