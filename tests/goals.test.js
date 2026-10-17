import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goalLabel, goalProgress, newlyReached } from '../src/lib/goals.js';

const now = new Date(2026, 9, 14, 18).getTime(); // Wednesday 14 Oct 2026
const run = (day, km) => ({ sport: 'run', date: new Date(2026, 9, day, 8).getTime(), distance: km * 1000, movingTime: km * 300, gain: 0 });
const weekly30 = { id: 'g', sport: 'run', metric: 'distance', period: 'week', target: 30000 };

test('goalProgress counts the current period and sport only', () => {
  const metas = [run(13, 10), run(6, 20), { ...run(13, 40), sport: 'ride' }];
  assert.deepEqual(goalProgress(weekly30, metas, now), { value: 10000, target: 30000, ratio: 1 / 3, done: false });
  assert.equal(goalProgress({ ...weekly30, period: 'month' }, metas, now).value, 30000);
  assert.equal(goalProgress({ ...weekly30, sport: '', metric: 'count', target: 2 }, metas, now).done, true);
});

test('ratio caps at 1 and newlyReached fires only on the crossing', () => {
  const before = [run(12, 25)];
  const after = [...before, run(14, 10)];
  assert.equal(goalProgress(weekly30, after, now).ratio, 1);
  assert.deepEqual(newlyReached([weekly30], before, after, now), [weekly30]);
  assert.deepEqual(newlyReached([weekly30], after, [...after, run(14, 5)], now), []);
});

test('goalLabel shows the target in the athlete unit', () => {
  assert.equal(goalLabel(weekly30), '30 km · Course · Cette semaine');
  assert.equal(goalLabel({ sport: '', metric: 'movingTime', period: 'month', target: 5400 }), '1.5 h · Tous sports · Ce mois');
  assert.equal(goalLabel({ sport: 'ride', metric: 'count', period: 'year', target: 1 }), '1 activité · Vélo · Cette année');
});
