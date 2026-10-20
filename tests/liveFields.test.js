import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LAYOUT, FIELDS, layoutFor, liveGain } from '../src/lib/liveFields.js';
import { addFix, lap, startRecording } from '../src/lib/recorder.js';

test('layoutFor: defaults, per sport, unknown and duplicate fields dropped', () => {
  assert.deepEqual(layoutFor(undefined, 'run'), DEFAULT_LAYOUT);
  const saved = { ride: { map: false, hero: 'speed', fields: ['distance', 'nope', 'distance', 'speed', 'gain'] } };
  assert.deepEqual(layoutFor(saved, 'ride'), { map: false, hero: 'speed', fields: ['distance', 'gain'] });
  assert.deepEqual(layoutFor(saved, 'run'), DEFAULT_LAYOUT);
  // The hero never shows twice, even from the default fields.
  assert.deepEqual(layoutFor({ run: { hero: 'distance' } }, 'run').fields, ['pace', 'avg', 'hr']);
  assert.equal(layoutFor({ run: { hero: 'bogus' } }, 'run').hero, 'time');
});

test('liveGain: smoothed climb, no altitude means 0', () => {
  const pts = Array.from({ length: 50 }, (_, i) => ({ ele: 100 + i }));
  assert.ok(Math.abs(liveGain(pts) - 46) < 1e-9); // the moving average trims 1.5 m at each end
  assert.equal(liveGain([{ ele: null }, { ele: null }]), 0);
  assert.equal(liveGain([]), 0);
});

test('lap pace counts only the distance since the last lap', () => {
  const M = 1 / 111195;
  let rec = startRecording({}, 0);
  for (let s = 0; s <= 100; s++) rec = addFix(rec, { lat: 45 + s * 4 * M, lon: 6, time: s * 1000, accuracy: 5 });
  rec = lap(rec, 100_000);
  assert.ok(Math.abs(rec.laps[0].dist - 400) < 1);
  for (let s = 101; s <= 200; s++) rec = addFix(rec, { lat: 45 + (400 + (s - 100) * 2) * M, lon: 6, time: s * 1000, accuracy: 5 });
  const f = FIELDS.lapPace.get({ rec, now: 200_000, time: 200 });
  assert.equal(f.value, '8:20'); // 200 m in 100 s
});

test('zone field: zone from the strap bpm and max HR, dash without strap', () => {
  assert.deepEqual(FIELDS.zone.get({ bpm: 150, maxHr: 200 }), { label: 'Zone FC', value: 'Z3', unit: 'Tempo' });
  assert.equal(FIELDS.zone.get({ bpm: 185, maxHr: 200 }).value, 'Z5');
  assert.equal(FIELDS.zone.get({ bpm: 90, maxHr: 200 }).value, 'Z1');
  assert.equal(FIELDS.zone.get({ bpm: null, maxHr: 200 }).value, '—');
});
