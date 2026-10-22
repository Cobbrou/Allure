import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActivity, cropActivity, defaultName, manualActivity, addWatchHr, needsWatchHr, withHr } from '../src/lib/activity.js';
import { demoHistory } from '../src/lib/demo.js';
import { dropSpikes, effort, sportFromGpxType } from '../src/lib/sports.js';
import { personalRecords } from '../src/lib/records.js';

test('createActivity builds a lightweight meta record', () => {
  const [h] = demoHistory(Date.now(), 1);
  const { meta, points } = createActivity({ ...h, source: 'demo' });
  assert.equal(points, h.points);
  assert.equal(meta.source, 'demo');
  assert.ok(meta.id && meta.distance > 1000 && meta.movingTime > 0);
  assert.ok(meta.preview.length <= 82 && meta.preview.length > 10);
  assert.equal(meta.points, undefined);
});

test('demo history: 20 activities over 60 days with plausible speeds', () => {
  const now = Date.now();
  const list = demoHistory(now);
  assert.equal(list.length, 20);
  for (const h of list) {
    const { meta } = createActivity(h);
    assert.ok(meta.date <= now && meta.date > now - 62 * 86400e3, 'date in range');
    const kmh = 3600 / meta.avgPace;
    const [lo, hi] = { run: [8, 16], ride: [17, 40], hike: [2.5, 6.5] }[h.sport];
    assert.ok(kmh > lo && kmh < hi, `${h.sport} ${kmh.toFixed(1)} km/h`);
  }
});

test('sport helpers', () => {
  assert.equal(sportFromGpxType('cycling'), 'ride');
  assert.equal(sportFromGpxType('Hiking'), 'hike');
  assert.equal(sportFromGpxType('running'), 'run');
  assert.equal(sportFromGpxType(), 'run');
  assert.equal(sportFromGpxType('trail_running'), 'trail');
  assert.equal(sportFromGpxType('VirtualRide'), 'virtual');
  assert.equal(sportFromGpxType('BIKING_STATIONARY'), 'virtual');
  assert.equal(sportFromGpxType('EBikeRide'), 'ebike');
  assert.equal(sportFromGpxType('GravelRide'), 'gravel');
  assert.equal(sportFromGpxType('AlpineSki'), 'ski');
  assert.equal(sportFromGpxType('STRENGTH_TRAINING'), 'workout');
  assert.equal(sportFromGpxType('YOGA'), 'yoga');
  assert.equal(sportFromGpxType('RUNNING_TREADMILL'), 'run');
  assert.deepEqual(effort('ride', 120), { label: 'Vitesse moyenne', short: 'Vitesse', value: '30.0', unit: 'km/h' });
  assert.equal(effort('run', 300).value, '5:00');
  assert.deepEqual([effort('swim', 1200).value, effort('swim', 1200).unit], ['2:00', '/100m']);
  assert.equal(defaultName('run', new Date(2026, 0, 1, 8).getTime()), 'Course du matin');
});

test('cropActivity trims the ends, recomputes stats and keeps what was typed', () => {
  // 2 km north at 4 m/s, a point every 10 m, then 10 minutes standing at the end.
  const pts = [
    ...Array.from({ length: 201 }, (_, i) => ({ lat: 45 + (i * 10) / 111195, lon: 6, ele: 100, time: i * 2500, hr: 150 })),
    ...Array.from({ length: 60 }, (_, i) => ({ lat: 45 + 2000 / 111195, lon: 6, ele: 100, time: 500e3 + (i + 1) * 10e3, hr: 100 })),
  ];
  const { meta } = createActivity({ sport: 'run', points: pts, laps: [0, 250e3, 400e3] });
  const typed = { ...meta, name: 'Mon tour', notes: 'stop final oublié', rpe: 4, efforts: [{ seg: 'x' }] };
  const out = cropActivity(typed, pts, 100, 200); // second km only
  assert.equal(out.points.length, 101);
  assert.equal(out.meta.id, meta.id);
  assert.equal(out.meta.name, 'Mon tour');
  assert.equal(out.meta.notes, 'stop final oublié');
  assert.equal(out.meta.rpe, 4);
  assert.ok(Math.abs(out.meta.distance - 1000) < 2, out.meta.distance);
  assert.equal(out.meta.date, 250e3);
  assert.deepEqual(out.meta.laps, [250e3, 400e3]);
  assert.equal(out.meta.efforts, undefined); // redone by saveActivities
  assert.equal(out.meta.avgHr, 150); // the 100 bpm stop is gone
});

test('manualActivity: summary from what was typed, no points', () => {
  const date = new Date(2026, 9, 20, 7).getTime();
  const { meta, points } = manualActivity({ sport: 'run', date, movingTime: 3000, distance: 10000, rpe: 6 });
  assert.deepEqual(points, []);
  assert.equal(meta.source, 'manual');
  assert.equal(meta.avgPace, 300);
  assert.equal(meta.rpe, 6);
  assert.equal(meta.name, defaultName('run', date));
  const gym = manualActivity({ id: 'x', name: 'Gym', sport: 'walk', date, movingTime: 1800 }).meta;
  assert.equal(gym.id, 'x');
  assert.equal(gym.avgPace, null);
  assert.equal(gym.rpe, undefined);
});

const north = (m, s) => ({ lat: 45 + m / 111195, lon: 6, time: s * 1000 });

test('dropSpikes removes an out-and-back jump, keeps a sustained fast stretch', () => {
  const run = Array.from({ length: 20 }, (_, s) => north(s * 4, s));
  run[10] = north(400, 10);
  const clean = dropSpikes(run, 'run');
  assert.equal(clean.length, 19);
  assert.ok(!clean.includes(run[10]));
  // A 15 m/s ride imported as a run: every point stays.
  const ride = Array.from({ length: 20 }, (_, s) => north(s * 15, s));
  assert.equal(dropSpikes(ride, 'run'), ride);
  const { meta } = createActivity({ sport: 'run', points: run });
  assert.ok(meta.distance < 80, meta.distance);
});

test('activities excluded from records give no personal record', () => {
  const base = { sport: 'run', bestEfforts: { '1k': 200 } };
  const [k] = personalRecords([{ ...base, id: 'a', noRecords: true }, { ...base, id: 'b', bestEfforts: { '1k': 250 } }]);
  assert.equal(k.activity.id, 'b');
});

test('withHr gives each point the nearest heart rate sample within the window', () => {
  const points = [0, 30, 100, 200].map((s) => ({ lat: 45.9, lon: 6.87, time: s * 1000 }));
  const hrs = [{ time: 5000, bpm: 120 }, { time: 40000, bpm: 140 }, { time: 95000, bpm: 150 }];
  assert.deepEqual(withHr(points, hrs, 20000).map((p) => p.hr), [120, 140, 150, null]);
  assert.deepEqual(withHr(points, [], 20000).map((p) => p.hr), [null, null, null, null]);
});

test('addWatchHr merges a watch heart rate into a phone recording, needsWatchHr picks recent ones', () => {
  const t0 = Date.parse('2026-10-01T08:00:00Z');
  const points = Array.from({ length: 60 }, (_, i) => ({ lat: 45.9 + i * 0.00003, lon: 6.87, ele: 1040, time: t0 + i * 1000 }));
  const { meta } = createActivity({ points, source: 'record' });
  meta.name = 'Typed';
  assert.equal(meta.avgHr, null);
  assert.ok(needsWatchHr(meta, t0 + 86400e3));
  assert.ok(!needsWatchHr(meta, t0 + 4 * 86400e3));
  assert.equal(addWatchHr(meta, points, [{ time: t0 - 600e3, bpm: 70 }]), null);
  const merged = addWatchHr(meta, points, [{ time: t0 + 10e3, bpm: 140 }, { time: t0 + 40e3, bpm: 150 }]);
  assert.equal(merged.meta.id, meta.id);
  assert.equal(merged.meta.name, 'Typed');
  assert.ok(merged.meta.avgHr >= 140 && merged.meta.avgHr <= 150);
  assert.ok(!needsWatchHr(merged.meta, t0 + 86400e3));
});
