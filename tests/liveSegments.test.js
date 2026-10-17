import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveSegments, segmentCue, segmentStep } from '../src/lib/liveSegments.js';
import { addFix, startRecording } from '../src/lib/recorder.js';

const M = 1 / 111195; // degrees of latitude per meter
const at = (north, east = 0) => ({ lat: 45 + north * M, lon: 6 + (east * M) / Math.cos(45 * Math.PI / 180) });
// Segment from 200 m to 600 m north; a past effort took 100 s.
const seg = { id: 's', name: 'Bosse', sport: 'run', points: Array.from({ length: 41 }, (_, i) => { const p = at(200 + i * 10); return [p.lon, p.lat]; }) };
const metas = [{ id: 'a', sport: 'run', efforts: [{ seg: 's', time: 100 }] }];
const segs = liveSegments([seg, { ...seg, id: 'r', sport: 'ride' }], 'run', metas);

test('liveSegments keeps the sport and the record', () => {
  assert.equal(segs.length, 1);
  assert.equal(segs[0].pr, 100);
  assert.ok(Math.abs(segs[0].line.distance - 400) < 5);
});

test('an attempt starts at the segment start and is timed at its end', () => {
  let s = null;
  for (let m = 0; m <= 200; m += 5) s = segmentStep(s, segs, { ...at(m), time: m * 250 });
  assert.equal(s.active, null); // at the start line, not past it yet
  for (let m = 205; m <= 610; m += 5) s = segmentStep(s, segs, { ...at(m), time: 50_000 + (m - 200) * 250 });
  assert.equal(s.active, null);
  assert.ok(Math.abs(s.last.time - 100) < 2, s.last.time); // 400 m at 4 m/s
});

test('leaving the segment abandons the attempt', () => {
  let s = segmentStep(null, segs, { ...at(205), time: 0 });
  s = segmentStep(s, segs, { ...at(250), time: 10_000 });
  s = segmentStep(s, segs, { ...at(260, 120), time: 20_000 });
  assert.equal(s.active, null);
  assert.equal(s.last, null);
});

test('recording speaks the start with the record, then the finish time', () => {
  let rec = startRecording({ liveSegs: segs }, 0);
  const cues = [];
  for (let m = 0; m <= 620; m += 10) {
    const prev = rec;
    rec = addFix(rec, { ...at(m), time: m * 200, accuracy: 5 });
    const c = segmentCue(prev, rec);
    if (c) cues.push(c);
  }
  assert.deepEqual(cues, ['Segment Bosse. Record : 1 minute 40.', 'Segment terminé en 1 minute 18. Nouveau record !']); // 80 s, timed from the first fix past the start
});
