import assert from 'node:assert/strict';
import { test } from 'node:test';
import { badges, CHALLENGES, challengeProgress, fmtChallenge, monthChallenges, newlyCompleted } from '../src/lib/challenges.js';

const ch = (id) => CHALLENGES.find((c) => c.id === id);
const at = (y, m, d, h = 9) => new Date(y, m, d, h).getTime();
const act = (date, sport, distance, extra = {}) => ({ id: String(date), date, sport, distance, movingTime: distance / 3, gain: 0, ...extra });

test('distance challenges sum the matching sports within the month', () => {
  const metas = [act(at(2026, 9, 2), 'run', 60000), act(at(2026, 9, 20), 'run', 45000), act(at(2026, 9, 3), 'ride', 80000), act(at(2026, 8, 30), 'run', 90000)];
  const p = challengeProgress(ch('run-100'), metas, 2026, 9);
  assert.equal(p.value, 105000);
  assert.equal(p.doneAt, at(2026, 9, 20));
  assert.equal(challengeProgress(ch('run-100'), metas, 2026, 8).done, false);
});

test('longest takes one activity, days counts distinct days', () => {
  const metas = [act(at(2026, 9, 2), 'run', 4000), act(at(2026, 9, 2, 18), 'run', 4000), act(at(2026, 9, 5), 'run', 5200)];
  assert.equal(challengeProgress(ch('run-5k'), metas, 2026, 9).value, 5200);
  assert.equal(challengeProgress(ch('days-12'), metas, 2026, 9).value, 2);
});

test('monthChallenges counts the days left, today included', () => {
  assert.equal(monthChallenges([], at(2026, 9, 17)).daysLeft, 15);
  assert.equal(monthChallenges([], at(2026, 9, 31)).daysLeft, 1);
});

test('badges cover every month since the first activity, newest first', () => {
  const metas = [act(at(2026, 6, 4), 'run', 6000), act(at(2026, 9, 1), 'run', 5000)];
  const got = badges(metas, at(2026, 9, 17)).filter((b) => b.id === 'run-5k');
  assert.deepEqual(got.map((b) => b.month), [9, 6]);
  assert.deepEqual(badges([], at(2026, 9, 17)), []);
});

test('newlyCompleted reports a challenge crossed by a new activity', () => {
  const before = [act(at(2026, 9, 2), 'run', 4000)];
  const after = [...before, act(at(2026, 9, 10), 'run', 5100)];
  assert.deepEqual(newlyCompleted(before, after, at(2026, 9, 17)).map((c) => c.id), ['run-5k']);
  assert.deepEqual(newlyCompleted(after, after, at(2026, 9, 17)), []);
});

test('fmtChallenge formats each metric', () => {
  assert.equal(fmtChallenge('distance', 12345), '12.3 km');
  assert.equal(fmtChallenge('longest', 100000), '100 km');
  assert.equal(fmtChallenge('gain', 849.6), '850 m');
  assert.equal(fmtChallenge('movingTime', 16200), '4 h 30');
  assert.equal(fmtChallenge('days', 1), '1 jour');
});
