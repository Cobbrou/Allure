import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultGear, gearFor, gearUsage, toggleDefault } from '../src/lib/gear.js';

const shoes = { id: 's', name: 'Route', kind: 'shoes', initial: 50_000, isDefault: true };
const old = { id: 'o', name: 'Vieilles', kind: 'shoes', retired: true, isDefault: false };
const bike = { id: 'b', name: 'Gravel', kind: 'bike', isDefault: false };
const gears = [shoes, old, bike];

test('gearUsage adds the initial distance to the activities using the gear', () => {
  const metas = [
    { gear: 's', distance: 10_000, movingTime: 3000, date: 5 },
    { gear: 's', distance: 5_000, movingTime: null, date: 9 },
    { gear: 'b', distance: 40_000, movingTime: 5000, date: 7 },
    { distance: 1_000, date: 1 },
  ];
  assert.deepEqual(gearUsage(shoes, metas), { distance: 65_000, count: 2, movingTime: 3000, last: 9 });
  assert.deepEqual(gearUsage(old, metas), { distance: 0, count: 0, movingTime: 0, last: null });
});

test('gearFor and defaultGear follow kind, sport and retirement', () => {
  assert.deepEqual(gearFor(gears, 'hike').map((g) => g.id), ['s']);
  assert.deepEqual(gearFor(gears, 'ride').map((g) => g.id), ['b']);
  assert.deepEqual(gearFor(gears, 'swim'), []);
  assert.equal(defaultGear(gears, 'run'), 's');
  assert.equal(defaultGear(gears, 'ride'), undefined);
  assert.equal(defaultGear([{ ...shoes, retired: true }], 'run'), undefined);
});

test('toggleDefault keeps one default per kind', () => {
  const next = toggleDefault(gears, 'o');
  assert.deepEqual(next.map((g) => g.isDefault), [false, true, false]);
  assert.deepEqual(toggleDefault(next, 'o').map((g) => g.isDefault), [false, false, false]);
  assert.equal(toggleDefault(gears, 'b')[0].isDefault, true); // other kinds untouched
});
