import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFix, pause, startRecording } from '../src/lib/recorder.js';
import { nextStep, startWorkout, stepCue, stepStatus, workoutStep, workoutSteps } from '../src/lib/workout.js';

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
