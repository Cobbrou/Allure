import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActivity, defaultName } from '../src/lib/activity.js';
import { demoHistory } from '../src/lib/demo.js';
import { effort, sportFromGpxType } from '../src/lib/sports.js';

test('createActivity builds a lightweight meta record', () => {
  const [h] = demoHistory(Date.now(), 1);
  const { meta, points } = createActivity({ ...h, source: 'demo' });
  assert.equal(points, h.points);
  assert.equal(meta.source, 'demo');
  assert.ok(meta.id && meta.distance > 1000 && meta.movingTime > 0);
  assert.ok(meta.preview.length <= 82 && meta.preview.length > 10);
  assert.equal(meta.points, undefined);
});

test('demo history: 20 activities over 60 days with plausible speeds', () => {
  const now = Date.now();
  const list = demoHistory(now);
  assert.equal(list.length, 20);
  for (const h of list) {
    const { meta } = createActivity(h);
    assert.ok(meta.date <= now && meta.date > now - 62 * 86400e3, 'date in range');
    const kmh = 3600 / meta.avgPace;
    const [lo, hi] = { run: [8, 16], ride: [17, 40], hike: [2.5, 6.5] }[h.sport];
    assert.ok(kmh > lo && kmh < hi, `${h.sport} ${kmh.toFixed(1)} km/h`);
  }
});

test('sport helpers', () => {
  assert.equal(sportFromGpxType('cycling'), 'ride');
  assert.equal(sportFromGpxType('Hiking'), 'hike');
  assert.equal(sportFromGpxType('running'), 'run');
  assert.equal(sportFromGpxType(), 'run');
  assert.deepEqual(effort('ride', 120), { label: 'Vitesse moyenne', short: 'Vitesse', value: '30.0', unit: 'km/h' });
  assert.equal(effort('run', 300).value, '5:00');
  assert.deepEqual([effort('swim', 1200).value, effort('swim', 1200).unit], ['2:00', '/100m']);
  assert.equal(defaultName('run', new Date(2026, 0, 1, 8).getTime()), 'Course du matin');
});
