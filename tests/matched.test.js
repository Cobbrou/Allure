import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMatch, matchedActivities } from '../src/lib/matched.js';

// Square loop of `side` degrees of latitude around (45, 6), as a preview of n points per side.
function square(side, { from = 0, reverse = false, n = 20, dLon = 0 } = {}) {
  const k = 1 / Math.cos(45 * Math.PI / 180); // keep it square in meters
  const corners = [[0, 0], [side * k, 0], [side * k, side], [0, side], [0, 0]];
  const pts = [];
  for (let c = 0; c < 4; c++) {
    const [x0, y0] = corners[c], [x1, y1] = corners[c + 1];
    for (let i = 0; i < n; i++) pts.push([6 + dLon + x0 + ((x1 - x0) * i) / n, 45 + y0 + ((y1 - y0) * i) / n]);
  }
  const rotated = [...pts.slice(from), ...pts.slice(0, from)];
  return reverse ? rotated.reverse() : rotated;
}
const loop = (id, opts, extra) => ({ id, sport: 'run', date: 0, distance: 4 * 0.02 * 111000, preview: square(0.02, opts), ...extra });

test('same loop matches whatever the start point and direction', () => {
  const a = loop('a');
  assert.equal(isMatch(a, loop('b', { from: 30, reverse: true })), true);
  assert.equal(isMatch(a, loop('c', { dLon: 0.0005 })), true); // ~40 m GPS offset
});

test('different route, distance or sport do not match', () => {
  const a = loop('a');
  assert.equal(isMatch(a, loop('b', { dLon: 0.01 })), false); // shifted ~800 m: half the loop elsewhere
  assert.equal(isMatch(a, { ...loop('c'), distance: a.distance * 1.3 }), false);
  assert.equal(isMatch(a, { ...loop('d'), sport: 'ride' }), false);
  assert.equal(isMatch(a, { ...loop('e'), preview: [] }), false);
});

test('matchedActivities includes the activity itself, oldest first', () => {
  const a = loop('a', {}, { date: 3 });
  const metas = [a, loop('b', {}, { date: 1 }), loop('x', { dLon: 0.05 }, { date: 2 })];
  assert.deepEqual(matchedActivities(a, metas).map((m) => m.id), ['b', 'a']);
});
