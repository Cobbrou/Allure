import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toGpx } from '../src/lib/formats/gpxExport.js';
import { safeName } from '../src/lib/share.js';

test('toGpx writes points, heart rate and escapes the title', () => {
  const meta = { name: 'Tour <Lac> & co', sport: 'ride', date: Date.UTC(2026, 9, 1, 8) };
  const pts = [
    { lat: 45.1, lon: 6.2, ele: 1000.5, time: Date.UTC(2026, 9, 1, 8), hr: 120 },
    { lat: 45.2, lon: 6.3, ele: null, time: null, hr: null },
  ];
  const gpx = toGpx(meta, pts);
  assert.match(gpx, /<name>Tour &lt;Lac&gt; &amp; co<\/name>/);
  assert.match(gpx, /<type>cycling<\/type>/);
  assert.match(gpx, /<trkpt lat="45.1" lon="6.2"><ele>1000.5<\/ele><time>2026-10-01T08:00:00.000Z<\/time>.*<gpxtpx:hr>120<\/gpxtpx:hr>/);
  assert.match(gpx, /<trkpt lat="45.2" lon="6.3"><\/trkpt>/);
  assert.equal((gpx.match(/<trkpt /g) ?? []).length, 2);
});

test('safeName keeps accents, drops unsafe characters', () => {
  assert.equal(safeName('Vélo à Annecy / test?'), 'Vélo-à-Annecy-test');
  assert.equal(safeName('???'), 'activite');
});
