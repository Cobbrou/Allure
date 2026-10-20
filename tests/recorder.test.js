import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFix, addHr, currentPace, draftWrites, joinDraft, elapsed, lap, lapCue, lapStarts, lapStatus, pause, recover, resume, splitCue, startRecording, tick } from '../src/lib/recorder.js';

const M = 1 / 111195; // degrees of latitude per meter
/** Fix `m` meters north of the origin at second `s`. */
const fix = (m, s, extra) => ({ lat: 45 + m * M, lon: 6, time: s * 1000, accuracy: 5, ...extra });
/** Feed fixes at constant `speed` m/s, one per second, from second `from` to `to`. */
const run = (rec, from, to, speed = 4, at = 0) => {
  for (let s = from; s <= to; s++) rec = addFix(rec, fix(at + (s - from) * speed, s));
  return rec;
};

test('steady run: distance, clock and current pace', () => {
  const rec = run(startRecording({}, 0), 0, 100, 4);
  assert.ok(Math.abs(rec.distance - 400) < 1, rec.distance);
  assert.equal(elapsed(rec, 100_000), 100);
  assert.ok(Math.abs(currentPace(rec) - 250) < 1, currentPace(rec));
});

test('inaccurate fixes and jitter are ignored', () => {
  let rec = addFix(startRecording({}, 0), fix(0, 0));
  rec = addFix(rec, fix(500, 1, { accuracy: 80 }));
  rec = addFix(rec, fix(1, 2));
  assert.equal(rec.points.length, 1);
  assert.equal(rec.distance, 0);
});

test('an inaccurate fix before the first point only sets the position', () => {
  let rec = addFix(startRecording({}, 0), fix(0, 0, { accuracy: 80 }));
  assert.equal(rec.pos.accuracy, 80);
  assert.equal(rec.points.length, 0);
  rec = addFix(rec, fix(10, 1));
  assert.equal(rec.points.length, 1);
  assert.equal(rec.distance, 0);
});

test('a GPS spike is skipped, a sustained jump is kept', () => {
  let rec = run(startRecording({}, 0), 0, 10, 4);
  rec = addFix(rec, fix(300, 11)); // 260 m in 1 s
  rec = addFix(rec, fix(44, 12));
  assert.equal(rec.points.length, 12);
  assert.ok(Math.abs(rec.distance - 44) < 1, rec.distance);
  for (let s = 13; s <= 19; s++) rec = addFix(rec, fix(1000 + s, s)); // moved for real (a car while paused…)
  assert.ok(rec.points.at(-1).lat > 45 + 1000 * M);
});

test('auto-pause stops the clock while stopped, resumes on movement', () => {
  let rec = run(startRecording({}, 0), 0, 60); // 240 m in 60 s
  rec = tick(rec, 64_000);
  assert.equal(rec.autoPaused, false);
  rec = tick(rec, 66_000);
  assert.equal(rec.autoPaused, true);
  assert.equal(elapsed(rec, 200_000), 60); // clock held at the last move
  assert.equal(currentPace(rec), null);
  rec = run(rec, 200, 210, 4, 240); // first fix is a 0 m step, the clock restarts on the second (201 s)
  assert.equal(rec.autoPaused, false);
  assert.equal(elapsed(rec, 210_000), 60 + 9);
});

test('auto-pause off keeps the clock running', () => {
  const rec = tick(run(startRecording({ autoPause: false }, 0), 0, 10), 100_000);
  assert.equal(rec.autoPaused, false);
  assert.equal(elapsed(rec, 100_000), 100);
});

test('manual pause ignores fixes and banks time', () => {
  let rec = run(startRecording({}, 0), 0, 30);
  rec = pause(rec, 30_000);
  const n = rec.points.length;
  rec = addFix(rec, fix(5000, 40));
  assert.equal(rec.points.length, n);
  assert.equal(elapsed(rec, 90_000), 30);
  rec = resume(rec, 90_000);
  assert.equal(elapsed(rec, 100_000), 40);
});

test('recover pauses with the clock at the last point', () => {
  const rec = recover(run(startRecording({}, 0), 0, 20));
  assert.equal(rec.paused, true);
  assert.equal(elapsed(rec, 999_000), 20);
});

test('splitCue speaks once per split, per sport', () => {
  const r = startRecording({}, 0);
  assert.equal(splitCue({ ...r, distance: 900 }, { ...r, distance: 950 }, 0), null);
  assert.equal(splitCue({ ...r, distance: 990 }, { ...r, distance: 1001, active: 330_000, runningSince: null }, 0),
    '1 kilomètre. Allure moyenne 5 minutes 30.');
  const ride = startRecording({ sport: 'ride' }, 0);
  assert.equal(splitCue({ ...ride, distance: 4990 }, { ...ride, distance: 5000, active: 600_000, runningSince: null }, 0),
    '5 kilomètres. Vitesse moyenne 30,0 kilomètres heure.');
});

test('laps: lap press, current lap time, saved lap starts and cue', () => {
  let rec = run(startRecording({}, 0), 0, 60);
  rec = lap(rec, 60_000);
  assert.deepEqual(lapStatus(rec, 90_000), { n: 2, time: 30 });
  assert.deepEqual(lapStarts(rec), [0, 60_000]);
  assert.equal(lap(pause(rec, 61_000), 62_000).laps.length, 1); // no lap while paused
  assert.equal(lapStarts(startRecording({}, 5)), null);
  assert.equal(lapCue(2, 3725), 'Tour 2 : 1 heure 2 minutes 5.');
});

test('draft saves write only the changed chunk and load back whole', () => {
  const store = new Map();
  const save = (rec, saved) => {
    const out = draftWrites(rec, saved);
    out.writes.forEach(([k, v]) => store.set(k, v));
    return out;
  };
  let rec = { ...run(startRecording({ route: { coords: [[6, 45], [6, 45.01]], cum: [0, 1112], distance: 1112 } }, 0), 0, 1200), follow: null };
  let { saved } = save(rec, null);
  assert.deepEqual(joinDraft(store), rec);

  rec = run(rec, 1201, 1210, 4, 4800);
  const next = save(rec, saved);
  assert.deepEqual(next.writes.map(([k]) => k), ['p2', 'current']); // route unchanged, 1211 points
  assert.deepEqual(joinDraft(store), rec);

  // A cut-short save: the points before the missing chunk survive.
  store.delete('p1');
  assert.equal(joinDraft(store).points.length, 500);
  // Drafts saved whole by an older version still load.
  assert.equal(joinDraft(new Map([['current', rec]])), rec);
  assert.equal(joinDraft(new Map()), null);
});

test('heart rate keeps coming in while stopped, without distance or moving time', () => {
  let rec = run(startRecording({}, 0), 0, 10); // 40 m
  const { distance } = rec;
  for (let s = 11; s <= 130; s++) rec = tick(addHr(addFix(rec, fix(40, s)), 120, s * 1000), s * 1000);
  const hrPts = rec.points.filter((p) => p.hr === 120);
  assert.equal(hrPts.length, 24); // one every 5 s over 2 min
  assert.equal(rec.distance, distance);
  assert.ok(hrPts.every((p) => p.lat === rec.points[10].lat));
  // No strap reading, paused or not started: nothing added.
  assert.equal(addHr(rec, null, 200_000), rec);
  assert.equal(addHr(pause(rec, 130_000), 120, 200_000).points, rec.points);
  const empty = startRecording({}, 0);
  assert.equal(addHr(empty, 120, 10_000), empty);
});

test('a slow steep hike does not auto-pause', () => {
  const at = (sport) => run(startRecording({ sport }, 0), 0, 60, 0.3);
  assert.equal(at('run').autoPaused, true);
  assert.equal(at('hike').autoPaused, false);
});
