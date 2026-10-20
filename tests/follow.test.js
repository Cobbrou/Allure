import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followCue, followRoute, followStep, progress } from '../src/lib/follow.js';
import { addFix, startRecording } from '../src/lib/recorder.js';

const M = 1 / 111195; // degrees of latitude per meter
const at = (north, east = 0) => ({ lat: 45 + north * M, lon: 6 + (east * M) / Math.cos(45 * Math.PI / 180) });
// Out and back: 500 m north, then back south to the start.
const outAndBack = followRoute({ id: 'r', name: 'Aller-retour' }, [
  ...Array.from({ length: 51 }, (_, i) => at(i * 10)),
  ...Array.from({ length: 50 }, (_, i) => at(490 - i * 10)),
]);

test('followRoute measures the route', () => {
  assert.ok(Math.abs(outAndBack.distance - 1000) < 5, outAndBack.distance);
});

test('progress starts at the start of a loop, not its end', () => {
  const p = progress(outAndBack, at(0), null);
  assert.equal(p.off, false);
  assert.ok(p.along < 10, p.along);
});

test('progress follows the right pass of an out-and-back', () => {
  let p = null;
  for (let m = 0; m <= 500; m += 20) p = progress(outAndBack, at(m), p);
  for (let m = 500; m >= 200; m -= 20) p = progress(outAndBack, at(m), p);
  assert.ok(Math.abs(p.along - 800) < 15, p.along);
  assert.equal(p.done, false);
  for (let m = 200; m >= 0; m -= 20) p = progress(outAndBack, at(m), p);
  assert.equal(p.done, true);
});

test('leaving and rejoining the route, with hysteresis', () => {
  let p = progress(outAndBack, at(100), null);
  p = progress(outAndBack, at(120, 40), p);
  assert.equal(p.off, false); // 40 m: still on
  const off = progress(outAndBack, at(140, 80), p);
  assert.equal(off.off, true);
  assert.ok(Math.abs(off.along - p.along) < 1); // progress kept while off route
  assert.equal(progress(outAndBack, at(160, 40), off).off, true); // 40 m: not back yet
  assert.equal(progress(outAndBack, at(160, 10), off).off, false);
});

test('recording a followed route raises spoken cues', () => {
  let rec = startRecording({ route: outAndBack }, 0);
  const step = (north, east, s) => { const prev = rec; rec = addFix(rec, { ...at(north, east), time: s * 1000, accuracy: 5 }); return followCue(prev, rec); };
  assert.equal(step(0, 0, 0), null);
  assert.equal(step(20, 0, 10), null);
  assert.match(step(40, 100, 20), /quitté/);
  assert.match(step(60, 0, 30), /retour/);
});

// Point to point: 1 km north.
const line = followRoute({ id: 'l', name: 'Ligne' }, Array.from({ length: 101 }, (_, i) => at(i * 10)));
const walk = (route, metres) => {
  let s = { route, follow: null, alt: { f: null, r: null, f0: null, r0: null } };
  for (const m of metres) s = followStep(s.route, s.follow, s.alt, at(m));
  return s;
};

test('a point-to-point route run backwards is followed backwards', () => {
  const start = walk(line, [1000]);
  assert.equal(start.follow.done, false); // not "finished" at the far end
  assert.ok(Math.abs(start.follow.along) < 10, start.follow.along);
  const s = walk(line, Array.from({ length: 31 }, (_, i) => 1000 - i * 20)); // 600 m south
  assert.equal(s.alt, null); // settled
  assert.equal(s.route.coords[0][1], line.coords.at(-1)[1]); // reversed
  assert.equal(s.follow.off, false);
  assert.ok(Math.abs(s.follow.along - 600) < 15, s.follow.along);
  assert.equal(walk(line, Array.from({ length: 51 }, (_, i) => 1000 - i * 20)).follow.done, true);
});

test('forward runs settle forward, loops either way', () => {
  const f = walk(line, Array.from({ length: 16 }, (_, i) => i * 20));
  assert.equal(f.alt, null);
  assert.equal(f.route, line);
  // The out-and-back started on its return leg: 500 m of the reversed route covered first.
  const b = walk(outAndBack, [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240]);
  assert.equal(b.alt, null);
  assert.equal(b.follow.off, false);
});

test('recordings follow a route either way', () => {
  let rec = startRecording({ route: line }, 0);
  for (let s = 0; s <= 30; s++) rec = addFix(rec, { ...at(1000 - s * 20), time: s * 5000, accuracy: 5 });
  assert.equal(rec.followAlt, null);
  assert.equal(rec.follow.off, false);
  assert.ok(Math.abs(rec.follow.along - 600) < 15, rec.follow.along);
});
