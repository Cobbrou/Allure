import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversine } from '../src/lib/geo.js';
import { hidePrivate, zoneCentre } from '../src/lib/privacy.js';

const M = 1 / 111195; // degrees of latitude per meter
// 2 km north from home, then back: a point every 100 m.
const track = [...Array.from({ length: 21 }, (_, i) => i * 100), ...Array.from({ length: 20 }, (_, i) => 1900 - i * 100)]
  .map((m, i) => ({ lat: 45 + m * M, lon: 6, time: i * 30000 }));
const home = { id: 'home', lat: 45, lon: 6, radius: 400 };

test('hidePrivate drops the start and end inside a zone, keeps the middle', () => {
  const out = hidePrivate(track, [home]);
  assert.ok(out.length > 0 && out.length < track.length - 6);
  // The circle moved by at most half a radius: nothing kept within half a radius of home.
  assert.ok(out.every((p) => haversine(p, home) > 200));
  assert.ok(out.some((p) => haversine(p, home) > 1900)); // the far end of the out-and-back stays
});

test('zoneCentre moves the circle 25 to 50 % of the radius, the same way every time', () => {
  for (const id of ['a', 'b', 'c', 'd']) {
    const d = haversine(zoneCentre({ ...home, id }), home);
    assert.ok(d >= 100 - 1 && d <= 200 + 1, `${id}: ${d}`);
  }
  assert.deepEqual(zoneCentre(home), zoneCentre({ ...home }));
});

test('hidePrivate cut points do not sit on one circle around home', () => {
  // Tracks leaving home in four directions: the first kept points are at different distances.
  const dists = [0, 90, 180, 270].map((deg) => {
    const r = deg * Math.PI / 180;
    const line = Array.from({ length: 40 }, (_, i) => ({
      lat: 45 + i * 50 * Math.cos(r) * M,
      lon: 6 + (i * 50 * Math.sin(r) * M) / Math.cos(45 * Math.PI / 180),
      time: deg * 1000 + i,
    }));
    return Math.round(haversine(hidePrivate(line, [home])[0], home));
  });
  assert.ok(new Set(dists).size > 1, String(dists));
});

test('hidePrivate leaves passes through a zone mid-activity, and tracks without zones', () => {
  const work = { id: 'work', lat: 45 + 2000 * M, lon: 6, radius: 200 };
  assert.equal(hidePrivate(track, [work]).length, track.length);
  assert.equal(hidePrivate(track, []), track);
  assert.deepEqual(hidePrivate(track, [{ ...home, radius: 5000 }]), []);
});
