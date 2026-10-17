import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectIntervals, intervalStats, lapIntervals } from '../src/lib/intervals.js';

// 1 Hz track along a line; `blocks`: [[seconds, m/s], …]. Optional ±`noise` m/s jitter.
function track(blocks, noise = 0) {
  const out = [{ dist: 0, time: 0, hr: 120 }];
  let k = 1;
  for (const [secs, v] of blocks) {
    for (let s = 0; s < secs; s++, k++) {
      const jitter = noise ? Math.sin(k * 12.9898) * noise : 0;
      out.push({ dist: out.at(-1).dist + v + jitter, time: k * 1000, hr: v > 4 ? 170 : 130 });
    }
  }
  return out;
}
const workout = [[600, 3], ...Array.from({ length: 6 }, () => [[90, 5], [60, 2.5]]).flat(), [300, 3]];

test('detects every rep of 6 × 90 s', () => {
  const iv = detectIntervals(track(workout, 0.3));
  const work = iv.filter((i) => i.work);
  assert.equal(work.length, 6);
  for (const w of work) {
    assert.ok(Math.abs(w.time - 90) <= 16, `rep lasted ${w.time}s`); // smoothing blurs edges by up to the window
    assert.ok(w.pace < 220 && w.pace > 180, `pace ${w.pace}`); // ~200 s/km at 5 m/s
    assert.ok(w.hr > 155);
  }
  assert.equal(iv[0].work, false); // warm-up
  assert.equal(iv.at(-1).work, false); // cool-down
  // Intervals tile the track.
  iv.slice(1).forEach((x, k) => assert.equal(x.from, iv[k].to));
});

test('a steady run with noise has no intervals', () => {
  assert.deepEqual(detectIntervals(track([[3600, 3.2]], 0.4)), []);
  assert.deepEqual(detectIntervals(track([[600, 3], [20, 1], [600, 3]])), []); // one traffic light
  const city = Array.from({ length: 5 }, () => [[400, 3], [40, 0]]).flat();
  assert.deepEqual(detectIntervals(track(city, 0.2)), []); // five red lights
});

test('lapIntervals cuts at lap starts and flags the fast laps', () => {
  const tr = track([[100, 5], [100, 2], [100, 5]]);
  const laps = lapIntervals(tr, [0, 100_000, 200_000]);
  assert.deepEqual(laps.map((l) => [l.from, l.to, l.work]), [[0, 100, true], [100, 200, false], [200, 300, true]]);
  assert.deepEqual(lapIntervals(tr, [0]), []);
  assert.equal(lapIntervals(tr, [1000, 100_000, 200_000]).length, 3); // lap clock 1 s after the first fix
  assert.deepEqual(lapIntervals(tr, [0, 299_000]), []); // both laps at the ends: one lap
});

test('intervalStats', () => {
  const s = intervalStats(track([[100, 4]]), 0, 100);
  assert.equal(s.dist, 400);
  assert.equal(s.time, 100);
  assert.equal(s.pace, 250);
});
