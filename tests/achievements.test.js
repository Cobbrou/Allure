import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS, achievementProgress, achievements, newlyUnlocked } from '../src/lib/achievements.js';

const ach = (id) => ACHIEVEMENTS.find((a) => a.id === id);
const at = (y, m, d, h = 9) => new Date(y, m, d, h).getTime();
const act = (date, sport, distance, extra = {}) => ({ id: String(date), date, sport, distance, movingTime: distance / 3, gain: 0, ...extra });

test('sums and longest span the whole history, filtered by sport', () => {
  const metas = [act(at(2024, 0, 5), 'run', 30e3), act(at(2026, 9, 1), 'ride', 50e3), act(at(2025, 3, 1), 'run', 42195)];
  const dist = achievementProgress(ach('dist-100'), metas);
  assert.equal(dist.value, 122195);
  assert.equal(dist.doneAt, at(2026, 9, 1)); // in date order, not list order
  assert.equal(achievementProgress(ach('marathon'), metas).doneAt, at(2025, 3, 1));
  assert.equal(achievementProgress(ach('century'), metas).done, false);
});

test('day streaks count consecutive days, across a DST change, and keep the longest run', () => {
  // 2026-03-29 is the spring DST change in Europe.
  const days = [25, 26, 27, 28, 29, 30, 31].map((d) => act(at(2026, 2, d), 'run', 5000));
  const p = achievementProgress(ach('streak-7'), [...days, act(at(2026, 3, 5), 'run', 5000), act(at(2026, 2, 27, 18), 'run', 3000)]);
  assert.equal(p.value, 7);
  assert.equal(p.doneAt, at(2026, 2, 31));
  assert.equal(achievementProgress(ach('streak-7'), days.filter((_, i) => i !== 3)).value, 3);
});

test('week streaks need one activity in each consecutive week', () => {
  const weekly = Array.from({ length: 12 }, (_, i) => act(at(2026, 0, 5 + i * 7), 'run', 5000));
  assert.equal(achievementProgress(ach('weeks-12'), weekly).done, true);
  assert.equal(achievementProgress(ach('weeks-12'), weekly.filter((_, i) => i !== 6)).value, 6);
});

test('sports, dawn and night look at each activity', () => {
  const metas = [act(at(2026, 0, 1, 5), 'run', 5000), act(at(2026, 0, 2, 21), 'ride', 5000), act(at(2026, 0, 3, 12), 'hike', 5000)];
  assert.equal(achievementProgress(ach('sports-3'), metas).done, true);
  assert.equal(achievementProgress(ach('dawn'), metas).doneAt, at(2026, 0, 1, 5));
  assert.equal(achievementProgress(ach('night'), metas).doneAt, at(2026, 0, 2, 21));
  assert.equal(achievementProgress(ach('dawn'), metas.slice(1)).done, false);
});

test('achievements lists unlocked first, newest first; newlyUnlocked reports only new ones', () => {
  const before = [act(at(2026, 0, 1), 'run', 5000)];
  const after = [...before, act(at(2026, 0, 2, 22), 'run', 5000)];
  const list = achievements(after);
  assert.deepEqual(list.slice(0, 2).map((a) => a.id), ['night', 'first']);
  assert.equal(list.length, ACHIEVEMENTS.length);
  assert.deepEqual(newlyUnlocked(before, after).map((a) => a.id), ['night']);
  assert.deepEqual(newlyUnlocked(after, after), []);
  assert.equal(achievements([]).some((a) => a.done), false);
});
