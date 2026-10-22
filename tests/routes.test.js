import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoute, joinLegs, legKey, decodeRoute, encodeRoute, legUrl, nearestFirst, parseLeg, routeFromPoints, routeUrl, straightLeg } from '../src/lib/routes.js';

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

test('nearestFirst orders routes by the closest point of their thumbnail', () => {
  const far = { id: 'far', preview: [[7, 46], [7.01, 46]] };
  const near = { id: 'near', preview: [[6.5, 45.5], [6, 45.001]] };
  assert.deepEqual(nearestFirst([far, near], [6, 45]).map((r) => r.id), ['near', 'far']);
});

test('routeUrl keeps to paved ways when roads are asked for, whatever the sport', () => {
  for (const sport of ['run', 'ride', 'hike']) assert.match(routeUrl([[6, 45], [6.1, 45.1]], sport, 'paved'), /profile=fastbike&/);
  assert.match(routeUrl([[6, 45], [6.1, 45.1]], 'run', 'trail'), /profile=hiking-mountain&/);
});

test('routeFromPoints: an imported track becomes an editable straight-line route', () => {
  // 10.5 km north, a point every 50 m.
  const points = Array.from({ length: 211 }, (_, i) => ({ lat: 45 + (i * 50) / 111195, lon: 6, ele: 1000 + i, time: i * 1000 }));
  const r = routeFromPoints({ name: 'Col', sport: 'ride', points });
  assert.equal(r.snap, false);
  assert.equal(r.waypoints.length, 11); // every km, the last one merged into the end
  assert.equal(r.legs.length, r.waypoints.length - 1);
  assert.deepEqual(joinLegs(r.legs).length, points.length);
  assert.ok(Math.abs(r.distance - 10500) < 20, r.distance);
  assert.deepEqual(r.waypoints.at(-1), [6, points.at(-1).lat]);
  assert.equal(joinLegs(r.legs)[5].time, undefined);
});

test('route links: encode then decode keeps the route, rejects junk', () => {
  // 3 km east with a 200 m bump north halfway, a point every 10 m, climbing.
  const points = Array.from({ length: 301 }, (_, i) => ({ lon: 6 + (i * 10) / 78600, lat: 45 + (i === 150 ? 200 / 111195 : 0), ele: 1000 + i }));
  const r = routeFromPoints({ name: 'Boucle « test »', sport: 'hike', points });
  const code = encodeRoute(r);
  assert.match(code, /^[\w-]+$/);
  const back = decodeRoute(`Regarde : https://x.app/#/route/link/${code}`);
  assert.equal(back.name, 'Boucle « test »');
  assert.equal(back.sport, 'hike');
  assert.notEqual(back.id, r.id);
  assert.deepEqual(back.waypoints, r.waypoints.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]));
  assert.ok(code.length < 400, `straight stretches simplified: ${code.length} chars`);
  assert.ok(Math.abs(back.distance - r.distance) < 15, `${back.distance} vs ${r.distance}`);
  assert.ok(Math.abs(back.gain - r.gain) <= 2, `${back.gain} vs ${r.gain}`);
  assert.equal(decodeRoute('nope'), null);
  assert.equal(decodeRoute(btoa(JSON.stringify({ v: 1, w: '??', p: '??' }))), null);
});
