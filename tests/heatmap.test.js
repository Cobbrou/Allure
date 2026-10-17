import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homeLines, thin } from '../src/lib/heatmap.js';

test('thin keeps points ~gap meters apart, plus the last one', () => {
  // 1 m steps north (1 m ≈ 0.000009°) over 100 m
  const pts = Array.from({ length: 101 }, (_, i) => ({ lat: 45 + i * 0.000009, lon: 6 }));
  const out = thin(pts, 15);
  assert.equal(out.length, 8); // 0, ~15, … ~90, then the end point at ~100
  assert.deepEqual(out[0], [6, 45]);
  assert.deepEqual(out.at(-1), [6, Math.round((45 + 100 * 0.000009) * 1e5) / 1e5]);
  assert.deepEqual(thin([]), []);
});

test('homeLines keeps the area with the most starts', () => {
  const at = (lon, lat) => ({ coords: [[lon, lat], [lon + 0.01, lat]] });
  const home = [at(6.1, 45.1), at(6.2, 45.2), at(6.3, 45.3)];
  assert.deepEqual(homeLines([at(2.3, 48.8), ...home, at(2.35, 48.85)]), home);
  assert.deepEqual(homeLines([]), []);
});
