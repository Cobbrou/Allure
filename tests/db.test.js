import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIGRATIONS, PATCHES, VERSION, splitRoute } from '../src/lib/db.js';

const M = 1 / 111195; // degrees of latitude per meter
/** `n` points north at `speed` m/s, one per second, heart rate 150. */
const track = (n, speed) => Array.from({ length: n }, (_, i) => ({ lat: 45 + i * speed * M, lon: 6, ele: 1000, time: i * 1000, hr: 150 }));

test('a migration exists for every schema version', () => {
  for (let v = 1; v <= VERSION; v++) assert.equal(typeof MIGRATIONS[v], 'function', `v${v}`);
  assert.equal(MIGRATIONS[VERSION + 1], undefined);
});

test('v2 patch: best efforts from the track, empty without one', () => {
  const { bestEfforts } = PATCHES[2](track(400, 4)); // 1.6 km at 4 m/s
  assert.ok(Math.abs(bestEfforts['1k'] - 250) < 2, JSON.stringify(bestEfforts));
  assert.deepEqual(PATCHES[2](undefined), { bestEfforts: {} });
});

test('v4 patch: seconds per bpm, empty without a track', () => {
  assert.deepEqual(PATCHES[4](track(61, 4)), { hrTime: { 150: 60 } });
  assert.deepEqual(PATCHES[4](undefined), { hrTime: {} });
});

test('v8 patch: slow sports get their moving time back, others untouched', () => {
  const slow = track(600, 0.3); // a steep hike: 0.3 m/s, under the old 0.5 m/s threshold
  const hike = PATCHES[8](slow, { sport: 'hike' });
  assert.ok(hike.movingTime > 590, hike.movingTime);
  assert.ok(hike.avgPace > 0);
  assert.deepEqual(PATCHES[8](slow, { sport: 'run' }), {});
  assert.deepEqual(PATCHES[8](undefined, { sport: 'hike' }), {});
});

test('v10 patch: rides get 20 / 40 / 100 km best efforts, other sports untouched', () => {
  const ride = track(2100, 10); // 21 km at 36 km/h
  const { bestEfforts } = PATCHES[10](ride, { sport: 'ride' });
  assert.deepEqual(Object.keys(bestEfforts), ['20k']);
  assert.deepEqual(PATCHES[10](ride, { sport: 'run' }), {});
  assert.deepEqual(PATCHES[10](undefined, { sport: 'ride' }), {});
});

test('v9 split: route points move out of the meta', () => {
  const legs = [[[6, 45], [6.01, 45]]];
  assert.deepEqual(splitRoute({ id: 'r', name: 'Loop', legs }), { meta: { id: 'r', name: 'Loop' }, legs });
  assert.deepEqual(splitRoute({ id: 'r' }), { meta: { id: 'r' }, legs: null });
});
