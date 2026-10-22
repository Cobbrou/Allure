import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoBackupDue, autoBackupName, backupBatches, backupDue, backupHeader, backupName, parseBackup, splitLines, staleBackups } from '../src/lib/backup.js';
import { createActivity } from '../src/lib/activity.js';
import { demoHistory } from '../src/lib/demo.js';

/** Single-object backup, the format before NDJSON. */
const makeBackup = (d) => ({ app: 'allure', exported: 0, ...d });
const data = {
  schema: 6,
  activities: [{ meta: { id: 'a1', name: 'Run' }, points: [{ lat: 45, lon: 6 }] }, { meta: {}, points: [] }],
  settings: { hr: { max: 190 } },
  segments: [{ id: 's1' }],
  routes: [{ id: 'r1' }, null],
};

test('parseBackup round-trips a backup and drops malformed entries', () => {
  const out = parseBackup(JSON.stringify(makeBackup(data)), 6);
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

test('parseBackup recomputes the stats of a backup from an older schema', () => {
  const [h] = demoHistory(Date.now(), 1);
  const { meta, points } = createActivity({ ...h, source: 'demo' });
  const stale = { ...meta, name: 'Mine', movingTime: 1, bestEfforts: {} };
  const parse = (schema) => parseBackup(JSON.stringify(makeBackup({ ...data, schema, activities: [{ meta: stale, points }] })), 9).activities[0].meta;
  assert.equal(parse(9).movingTime, 1);
  const fresh = parse(8);
  assert.equal(fresh.movingTime, meta.movingTime);
  assert.deepEqual(fresh.bestEfforts, meta.bestEfforts);
  assert.equal(fresh.name, 'Mine');
  assert.equal(fresh.id, meta.id);
});

test('backupDue after 20 new activities or a month-old backup, weekly at most', () => {
  const now = Date.UTC(2026, 9, 20), day = 86400e3;
  const acts = (n, at = now) => Array.from({ length: n }, () => ({ date: at }));
  assert.equal(backupDue({ activities: acts(19), now }), false);
  assert.equal(backupDue({ activities: acts(20), now }), true);
  assert.equal(backupDue({ activities: acts(3, now - 31 * day), now }), true);
  assert.equal(backupDue({ last: { at: now - 31 * day, count: 3 }, activities: acts(3), now }), false);
  assert.equal(backupDue({ last: { at: now - 31 * day, count: 3 }, activities: acts(4), now }), true);
  assert.equal(backupDue({ last: { at: now - day, count: 3 }, activities: acts(23), now }), true);
  assert.equal(backupDue({ nudged: now - 2 * day, activities: acts(30), now }), false);
});

/** NDJSON backup lines: header, then one line per activity. */
const ndjson = (d) => [backupHeader(d, 0), ...d.activities.map((a) => JSON.stringify(a))];
const collect = async (gen) => { const out = []; for await (const b of gen) out.push(b); return out; };

test('backupBatches restores an NDJSON backup in batches, extras on the first only', async () => {
  const acts = Array.from({ length: 5 }, (_, i) => ({ meta: { id: `a${i}` }, points: [] }));
  const batches = await collect(backupBatches([...ndjson({ ...data, activities: acts }), '', '{broken'], 6, 2));
  assert.deepEqual(batches.map((b) => b.activities.map((a) => a.meta.id)), [['a0', 'a1'], ['a2', 'a3'], ['a4']]);
  assert.deepEqual(batches[0].settings, { hr: { max: 190 } });
  assert.deepEqual(batches[0].routes, [{ id: 'r1' }]);
  assert.deepEqual(batches[1].settings, {});
  assert.deepEqual(batches[2].segments, []);
});

test('backupBatches: settings alone, a single-object backup, other files', async () => {
  const empty = await collect(backupBatches(ndjson({ ...data, activities: [] }), 6));
  assert.equal(empty.length, 1);
  assert.deepEqual(empty[0].segments, [{ id: 's1' }]);
  const legacy = await collect(backupBatches([JSON.stringify(makeBackup(data))], 6));
  assert.deepEqual(legacy[0].activities, [data.activities[0]]);
  await assert.rejects(collect(backupBatches(['not json'], 6)), /sauvegarde Allure/);
  await assert.rejects(collect(backupBatches([], 6)), /sauvegarde Allure/);
  await assert.rejects(collect(backupBatches(ndjson({ ...data, schema: 7 }), 6)), /plus récente/);
});

test('splitLines rebuilds lines across chunks', async () => {
  assert.deepEqual(await collect(splitLines(['ab', 'c\nd', 'e\n', '\nf', 'g'])), ['abc', 'de', '', 'fg']);
  assert.deepEqual(await collect(splitLines(['x\n'])), ['x']);
});

test('automatic backup: weekly when on and there is something to save; prunes old ones and cut writes', () => {
  const now = Date.UTC(2026, 9, 22, 8);
  assert.equal(autoBackupName(now), 'allure-auto-2026-10-22.json');
  assert.equal(autoBackupDue(null, 5, now), false);
  assert.equal(autoBackupDue({ on: false }, 5, now), false);
  assert.equal(autoBackupDue({ on: true }, 0, now), false);
  assert.equal(autoBackupDue({ on: true }, 5, now), true); // never run
  assert.equal(autoBackupDue({ on: true, at: now - 6 * 86400e3 }, 5, now), false);
  assert.equal(autoBackupDue({ on: true, at: now - 7 * 86400e3 }, 5, now), true);
  const names = ['allure-auto-2026-10-08.json', 'notes.txt', 'allure-auto-2026-10-22.json', 'allure-auto-2026-10-15.json', 'allure-auto-2026-10-01.json.part', 'allure-sauvegarde-2026-10-01.json'];
  assert.deepEqual(staleBackups(names), ['allure-auto-2026-10-08.json', 'allure-auto-2026-10-01.json.part']);
  assert.deepEqual(staleBackups(names.slice(0, 2)), []);
});
