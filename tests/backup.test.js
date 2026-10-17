import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupName, makeBackup, parseBackup } from '../src/lib/backup.js';

const data = {
  schema: 6,
  activities: [{ meta: { id: 'a1', name: 'Run' }, points: [{ lat: 45, lon: 6 }] }, { meta: {}, points: [] }],
  settings: { hr: { max: 190 } },
  segments: [{ id: 's1' }],
  routes: [{ id: 'r1' }, null],
};

test('parseBackup round-trips a backup and drops malformed entries', () => {
  const out = parseBackup(JSON.stringify(makeBackup(data, 0)), 6);
  assert.deepEqual(out.activities, [data.activities[0]]);
  assert.deepEqual(out.settings, { hr: { max: 190 } });
  assert.deepEqual(out.segments, [{ id: 's1' }]);
  assert.deepEqual(out.routes, [{ id: 'r1' }]);
});

test('parseBackup keeps image data URLs only', () => {
  const acts = [{ meta: { id: 'a1' }, points: [], photos: ['data:image/jpeg;base64,AAAA', 'https://x/y.jpg', 3] }, { meta: { id: 'a2' }, points: [], photos: 'no' }];
  const out = parseBackup(JSON.stringify(makeBackup({ ...data, activities: acts })), 6);
  assert.deepEqual(out.activities, [{ meta: { id: 'a1' }, points: [], photos: ['data:image/jpeg;base64,AAAA'] }, { meta: { id: 'a2' }, points: [] }]);
});

test('parseBackup rejects other files and newer schemas', () => {
  assert.throws(() => parseBackup('not json', 6), /sauvegarde Allure/);
  assert.throws(() => parseBackup('{"activities":[]}', 6), /sauvegarde Allure/);
  assert.throws(() => parseBackup(JSON.stringify(makeBackup({ ...data, schema: 7 })), 6), /plus récente/);
});

test('backupName is dated', () => {
  assert.equal(backupName(Date.UTC(2026, 9, 17)), 'allure-sauvegarde-2026-10-17.json');
});
