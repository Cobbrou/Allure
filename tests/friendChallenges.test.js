import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decode, encode, mergeEntries, receive, standings } from '../src/lib/friendChallenges.js';

const day = (d) => new Date(2026, 9, d).getTime();
const run = (d, km) => ({ sport: 'run', date: day(d) + 8 * 3600000, distance: km * 1000, movingTime: km * 300, gain: 10 });
const ch = { id: 'c1', title: 'Octobre', metric: 'distance', sport: 'run', from: day(1), to: day(15), entries: [], me: 'me' };

test('standings count the challenge dates and sport, best first', () => {
  const metas = [run(2, 10), run(14, 5), run(15, 50), { ...run(3, 40), sport: 'ride' }];
  const s = standings({ ...ch, entries: [{ id: 'a', name: 'Ana', value: 20000, at: 1 }] }, metas, 'Moi');
  assert.deepEqual(s.map((e) => [e.name, e.value]), [['Ana', 20000], ['Moi', 15000]]);
});

test('encode / decode round-trips with my result, unicode names and no local id', () => {
  const back = decode(`https://x.app/#/challenge/${encode(ch, [run(2, 10)], 'Zoé 🏃', 7)}`);
  assert.equal(back.me, undefined);
  assert.deepEqual(back.entries, [{ id: 'me', name: 'Zoé 🏃', value: 10000, at: 7 }]);
  assert.equal(back.title, 'Octobre');
  assert.equal(decode(`Rejoins mon défi : ${encode(ch, [], 'A')}`).id, 'c1');
});

test('decode rejects garbage and invalid rules', () => {
  assert.equal(decode('nope!'), null);
  const bad = (o) => btoa(JSON.stringify({ v: 1, ...ch, ...o }));
  assert.equal(decode(bad({ metric: '__proto__' })), null);
  assert.equal(decode(bad({ to: ch.from })), null);
  assert.equal(decode(bad({ entries: [{ id: 'x', value: -1, at: 1 }, { id: 'y', value: 3, at: 1 }] })).entries.length, 1);
});

test('receive joins a new challenge, then merges entries keeping the newest', () => {
  const { me, ...shared } = ch;
  const joined = receive([], { ...shared, entries: [{ id: 'a', name: 'Ana', value: 1, at: 1 }] }, 'b');
  assert.equal(joined[0].me, 'b');
  const merged = receive(joined, { ...shared, entries: [{ id: 'a', name: 'Ana', value: 5, at: 2 }, { id: 'c', name: 'Cy', value: 2, at: 2 }] }, 'zz');
  assert.equal(merged[0].me, 'b');
  assert.deepEqual(merged[0].entries.map((e) => e.value), [5, 2]);
  assert.deepEqual(mergeEntries([{ id: 'a', at: 3, value: 9 }], [{ id: 'a', at: 2, value: 1 }]), [{ id: 'a', at: 3, value: 9 }]);
});
