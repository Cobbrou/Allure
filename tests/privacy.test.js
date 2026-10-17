import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hidePrivate } from '../src/lib/privacy.js';

const M = 1 / 111195; // degrees of latitude per meter
// 2 km north from home, then back: a point every 100 m.
const track = [...Array.from({ length: 21 }, (_, i) => i * 100), ...Array.from({ length: 20 }, (_, i) => 1900 - i * 100)]
  .map((m) => ({ lat: 45 + m * M, lon: 6 }));
const home = { lat: 45, lon: 6, radius: 400 };

test('hidePrivate drops the start and end inside a zone, keeps the middle', () => {
  const out = hidePrivate(track, [home]);
  assert.equal(out.length, track.length - 10); // 0..400 m at both ends
  assert.ok(out.every((p) => (p.lat - 45) / M > 400));
});

test('hidePrivate leaves passes through a zone mid-activity, and tracks without zones', () => {
  const work = { lat: 45 + 2000 * M, lon: 6, radius: 200 };
  assert.equal(hidePrivate(track, [work]).length, track.length);
  assert.equal(hidePrivate(track, []), track);
  assert.deepEqual(hidePrivate(track, [{ ...home, radius: 5000 }]), []);
});
