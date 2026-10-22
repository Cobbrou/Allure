import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFix, pause, startRecording } from '../src/lib/recorder.js';
import { LIBRARY, livePace, nextStep, planVsDone, paceCueText, savedWorkout, startWorkout, stepCue, stepStatus, workoutStep, workoutSteps } from '../src/lib/workout.js';
import { trainingPaces } from '../src/lib/paces.js';

const W = { warmup: 60, reps: 3, work: { type: 'dist', value: 200 }, rest: { type: 'time', value: 30 }, cooldown: 0 };

test('workoutSteps: warm-up, reps with recovery between them, no empty steps', () => {
  assert.deepEqual(workoutSteps(W).map((s) => s.kind), ['warmup', 'work', 'rest', 'work', 'rest', 'work']);
  assert.deepEqual(workoutSteps({ ...W, warmup: 0, rest: { type: 'time', value: 0 }, cooldown: 120 }).map((s) => s.kind), ['work', 'work', 'work', 'cooldown']);
});

test('time steps end on running time; distance steps on meters since the step start', () => {
  const M = 1 / 111195;
  let rec = startRecording({ autoPause: false, workout: startWorkout(W) }, 0);
  let lat = 45;
  for (let s = 1; s <= 160; s++) {
    lat += 4 * M; // 4 m/s
    rec = workoutStep(addFix(rec, { lat, lon: 6, time: s * 1000, accuracy: 5 }), s * 1000);
    if (s === 60) assert.equal(rec.workout.i, 1, 'warm-up over at 60 s');
  }
  // 60 s warm-up, 200 m effort (~50 s), 30 s recovery, then the second effort.
  assert.equal(rec.workout.steps[rec.workout.i].kind, 'work');
  assert.equal(rec.workout.steps[rec.workout.i].rep, 2);
  assert.equal(rec.laps.length, 3);
  assert.ok(Math.abs(rec.laps[1].dist - rec.laps[0].dist - 200) <= 4);
});

test('nextStep skips the current step; nothing moves while paused or after the end', () => {
  let rec = startRecording({ workout: startWorkout(W) }, 0);
  rec = nextStep(rec, 10_000);
  assert.equal(rec.workout.i, 1);
  assert.equal(stepCue(rec), 'Effort 1 sur 3 : 200 m.');
  assert.equal(nextStep(pause(rec, 11_000), 12_000).workout.i, 1);
  for (let i = 0; i < 5; i++) rec = nextStep(rec, 20_000 + i);
  assert.equal(stepStatus(rec, 30_000), null);
  assert.equal(stepCue(rec), 'Séance terminée.');
  assert.equal(nextStep(rec, 40_000), rec);
});

test('startWorkout resolves pace targets from the VDOT, drops them without one', () => {
  const p = trainingPaces(50);
  const w = startWorkout({ ...W, pace: 'threshold' }, 50);
  assert.deepEqual(w.steps[1].target, { pace: 'threshold', range: p.threshold });
  assert.equal(w.steps[0].target, undefined);
  assert.equal(startWorkout({ ...W, pace: 'threshold' }, null).steps[1].target, undefined);
  // Flat step lists number their efforts.
  for (const item of LIBRARY) {
    const live = startWorkout(item, 50);
    assert.equal(live.reps, item.steps.filter((s) => s.kind === 'work').length, item.id);
    assert.ok(live.steps.every((s) => !s.target || s.target.range.length === 2), item.id);
  }
  assert.equal(startWorkout(LIBRARY.find((x) => x.id === 'vo2'), 50).steps.at(-2).rep, 5);
});

test('paceCheck cues after 20 s off the range, then at most once a minute', () => {
  const M = 1 / 111195;
  const range = trainingPaces(50).threshold; // ~4:10-4:20 /km
  let rec = startRecording({ autoPause: false, workout: startWorkout({ steps: [{ kind: 'work', type: 'time', value: 600, target: { pace: 'threshold' } }] }, 50) }, 0);
  let lat = 45;
  const cues = [];
  const runAt = (secs, pace, from) => {
    for (let s = from; s < from + secs; s++) {
      lat += (1000 / pace) * M;
      rec = workoutStep(addFix(rec, { lat, lon: 6, time: s * 1000, accuracy: 5 }), s * 1000);
      if (rec.workout.cueAt === s * 1000) cues.push([s, rec.workout.cue]);
    }
  };
  runAt(60, (range[0] + range[1]) / 2, 1); // on pace: no cue
  assert.deepEqual(cues, []);
  assert.ok(Math.abs(livePace(rec.workout) - (range[0] + range[1]) / 2) < 3);
  runAt(150, 320, 61); // far too slow
  assert.equal(cues[0][1], 'faster');
  assert.ok(cues[0][0] > 61 + 20 && cues[0][0] < 61 + 60, `first cue at ${cues[0][0]}`);
  assert.equal(cues[1][0] - cues[0][0], 60);
  assert.equal(paceCueText('slower'), 'Ralentis.');
});

test('savedWorkout keeps the steps reached, one per lap', () => {
  let rec = startRecording({ workout: startWorkout(W, 50) }, 0);
  rec = nextStep(nextStep(rec, 10_000), 20_000);
  const saved = savedWorkout(rec, 30_000);
  assert.deepEqual(saved.steps.map((s) => s.kind), ['warmup', 'work', 'rest']);
  const run = { ...rec, laps: [{ at: 10, dist: 0 }, { at: 20, dist: 1000 }], distance: 1100 };
  assert.deepEqual(savedWorkout(run, 30_000).steps.map((s) => s.pace), [undefined, 10, 100]); // standing still, 1 km in 10 s, 100 m in 10 s
  assert.equal(rec.laps.length, 2);
});

test('planVsDone pairs laps with steps and checks pace targets', () => {
  const steps = [{ kind: 'warmup' }, { kind: 'work', target: { pace: 'threshold', range: [250, 260] } }, { kind: 'rest' }, { kind: 'work', target: { pace: 'threshold', range: [250, 260] } }];
  const laps = [{ pace: 330, work: false }, { pace: 255, work: true }, { pace: 340 }, { pace: 270 }, { pace: 300 }];
  const out = planVsDone(laps, { steps });
  assert.deepEqual(out.map((l) => l.work), [false, true, false, true, undefined]);
  assert.deepEqual(out.map((l) => l.hit), [undefined, true, undefined, false, undefined]);
  assert.equal(planVsDone(laps, null), laps);
});
