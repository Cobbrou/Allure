import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoute, joinLegs, legKey, legUrl, parseLeg, straightLeg } from '../src/lib/routes.js';

const M = 0.000009; // ≈ 1 m of latitude in degrees

test('legUrl picks a cycling profile for rides and a trail profile otherwise', () => {
  assert.match(legUrl([6, 45], [6.1, 45.1], 'ride'), /lonlats=6,45\|6\.1,45\.1&profile=trekking/);
  assert.match(legUrl([6, 45], [6.1, 45.1], 'run'), /profile=hiking-mountain/);
  assert.notEqual(legKey([6, 45], [6, 46], 'run', true), legKey([6, 45], [6, 46], 'run', false));
});

test('parseLeg reads lon, lat and elevation, and rejects an empty answer', () => {
  const pts = parseLeg({ features: [{ geometry: { coordinates: [[6, 45, 1000], [6, 45.001, 1010]] } }] });
  assert.deepEqual(pts, [{ lon: 6, lat: 45, ele: 1000 }, { lon: 6, lat: 45.001, ele: 1010 }]);
  assert.throws(() => parseLeg({ features: [] }));
});

test('joinLegs drops the waypoint shared by consecutive legs', () => {
  const a = [6, 45], b = [6, 45.001], c = [6, 45.002];
  const pts = joinLegs([straightLeg(a, b), straightLeg(b, c)]);
  assert.deepEqual(pts.map((p) => p.lat), [45, 45.001, 45.002]);
});

test('createRoute measures distance and climb', () => {
  const points = Array.from({ length: 101 }, (_, i) => ({ lon: 6, lat: 45 + i * 10 * M, ele: 1000 + i }));
  const r = createRoute({ name: 'Boucle', sport: 'run', snap: true, waypoints: [[6, 45], [6, 45 + 500 * M], [6, 45 + 1000 * M]], legs: [points.slice(0, 51), points.slice(50)] });
  assert.ok(Math.abs(r.distance - 1000) < 5);
  assert.ok(r.gain > 90 && r.gain <= 100);
  assert.ok(r.preview.length > 1);
});
