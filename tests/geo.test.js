import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitToBox, tileOf, tilesAlong, toPlane } from '../src/lib/geo.js';

const box = { x: 100, y: 0, w: 200, h: 100 };

test('fitToBox keeps aspect ratio and centers', () => {
  // 10 x 10 square into a 200 x 100 box: scaled to 100 x 100, centered horizontally.
  assert.deepEqual(fitToBox([[0, 0], [10, 10]], box), [[150, 0], [250, 100]]);
});

test('fitToBox stretch fills both axes', () => {
  assert.deepEqual(fitToBox([[0, 0], [10, 10]], box, true), [[100, 0], [300, 100]]);
});

test('fitToBox survives a single point or a flat line', () => {
  assert.deepEqual(fitToBox([[5, 5]], box), [[200, 50]]);
  assert.ok(fitToBox([[0, 3], [10, 3]], box).every(([, y]) => y === 50));
});

test('toPlane points north up', () => {
  const [a, b] = toPlane([{ lat: 45, lon: 6 }, { lat: 45.1, lon: 6 }]);
  assert.ok(b[1] < a[1]);
});

test('tileOf matches the slippy map tile scheme', () => {
  assert.deepEqual(tileOf({ lat: 48.8566, lon: 2.3522 }, 10), { x: 518, y: 352 }); // Paris
  assert.deepEqual(tileOf({ lat: 0, lon: 0 }, 0), { x: 0, y: 0 });
});

test('tilesAlong covers a straight leg without gaps', () => {
  // Two points 20 km apart along a parallel: every z14 column between them is covered.
  const line = [{ lat: 45.9, lon: 6.7 }, { lat: 45.9, lon: 6.958 }];
  const tiles = tilesAlong(line, { minZoom: 14, maxZoom: 14, buffer: 300 });
  const xs = new Set(tiles.map((t) => t.x));
  const a = tileOf(line[0], 14).x, b = tileOf(line[1], 14).x;
  for (let x = a; x <= b; x++) assert.ok(xs.has(x), `column ${x}`);
  assert.ok(tiles.length < (b - a + 1) * 3); // a corridor, not the bounding box
});

test('tilesAlong returns each tile once across zooms', () => {
  const tiles = tilesAlong([{ lat: 45.9, lon: 6.87 }, { lat: 45.91, lon: 6.88 }], { minZoom: 0, maxZoom: 3, buffer: 500 });
  assert.equal(tiles.length, 4); // one tile per zoom for a short line
  assert.deepEqual(tiles[0], { z: 0, x: 0, y: 0 });
});
