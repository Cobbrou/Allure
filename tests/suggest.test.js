import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversine } from '../src/lib/geo.js';
import { splitLegs, unpavedShare } from '../src/lib/routes.js';
import { cellKey, familiarity, loopWaypoints, offset, rank } from '../src/lib/suggest.js';

const ll = ([lon, lat]) => ({ lon, lat });
const start = [6.87, 45.92];

test('offset moves the given distance and direction', () => {
  const east = offset(start, 1000, 90);
  assert.ok(Math.abs(haversine(ll(start), ll(east)) - 1000) < 5);
  assert.ok(east[0] > start[0] && Math.abs(east[1] - start[1]) < 1e-6);
});

test('loopWaypoints draws a closed loop heading out the right way', () => {
  const w = loopWaypoints(start, 10000, 0);
  assert.equal(w.length, 5);
  assert.deepEqual(w[0], start);
  assert.deepEqual(w.at(-1), start);
  assert.ok(w[2][1] > start[1]); // opposite point lies north
  let len = 0;
  for (let i = 1; i < w.length; i++) len += haversine(ll(w[i - 1]), ll(w[i]));
  assert.ok(len > 5000 && len < 8000, len); // square inside a circle of 10 km / 1.25
  assert.ok(loopWaypoints(start, 10000, 0, 1.5)[2][1] > w[2][1]); // scale grows the loop
});

test('familiarity counts route points on known ground', () => {
  const cells = new Set([cellKey(6.87, 45.92)]);
  assert.equal(familiarity([{ lon: 6.87, lat: 45.92 }, { lon: 6.9, lat: 45.95 }], cells), 0.5);
  assert.equal(familiarity([{ lon: 6.87, lat: 45.92 }], new Set()), 0);
});

test('rank honours distance, terrain, surface and novelty', () => {
  const prefs = { distance: 10000, terrain: '', surface: '', discover: false };
  const a = { id: 'a', distance: 10200, gain: 400, unpaved: 0.8, familiar: 0.9 };
  const b = { id: 'b', distance: 11500, gain: 50, unpaved: 0.1, familiar: 0.1 };
  assert.equal(rank([a, b], prefs)[0].id, 'a');
  assert.equal(rank([a, b], { ...prefs, terrain: 'flat' })[0].id, 'b');
  assert.equal(rank([a, b], { ...prefs, surface: 'paved' })[0].id, 'b');
  assert.equal(rank([a, b], { ...prefs, discover: true })[0].id, 'b');
  assert.equal(rank([a, b, a, b], prefs, 3).length, 3);
});

test('unpavedShare weighs ways by distance, splitLegs cuts at the waypoints', () => {
  const head = ['Longitude', 'Latitude', 'Elevation', 'Distance', 'x', 'x', 'x', 'x', 'x', 'WayTags'];
  const row = (d, tags) => ['0', '0', '0', String(d), '', '', '', '', '', tags];
  const json = { features: [{ properties: { messages: [head, row(300, 'highway=residential surface=asphalt'), row(100, 'highway=track'), row(100, 'highway=path surface=asphalt')] } }] };
  assert.equal(unpavedShare(json), 0.2);
  const pts = [0, 1, 2, 3, 4].map((i) => ({ lon: 6 + i * 0.01, lat: 45 }));
  const legs = splitLegs(pts, [[6, 45], [6.021, 45], [6.04, 45]]);
  assert.deepEqual(legs.map((l) => l.length), [3, 3]);
  assert.equal(legs[0].at(-1), legs[1][0]);
});
