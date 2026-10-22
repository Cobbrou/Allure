import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indoorActivity } from '../src/lib/activity.js';
import { addReadings, elapsed, startRecording } from '../src/lib/recorder.js';
import { baseSport, isRun, SPORTS } from '../src/lib/sports.js';
import { filterActivities, weekStreak, yearRecap } from '../src/lib/stats.js';
import { fmtWeather, sky } from '../src/lib/weather.js';

const day = (y, m, d, h = 9) => new Date(y, m, d, h).getTime();
const act = (date, patch = {}) => ({ id: String(date), name: 'Sortie', sport: 'run', date, distance: 10000, movingTime: 3000, gain: 50, ...patch });

test('new sports count as their base sport', () => {
  assert.equal(baseSport('trail'), 'run');
  assert.equal(baseSport('gravel'), 'ride');
  assert.equal(baseSport('hike'), 'hike');
  assert.ok(isRun('trail') && isRun('run') && !isRun('hike'));
  assert.ok(SPORTS.yoga.indoor && SPORTS.virtual.indoor && !SPORTS.run.indoor);
});

test('weekStreak: weeks in a row up to this one, this week not over yet, best ever', () => {
  const now = day(2026, 9, 22); // a Thursday
  const metas = [act(day(2026, 9, 13)), act(day(2026, 9, 6)), act(day(2026, 8, 29)), act(day(2026, 7, 1)), act(day(2026, 7, 8)), act(day(2026, 7, 15)), act(day(2026, 7, 22))];
  assert.deepEqual(weekStreak(metas, now), { current: 3, best: 4 });
  assert.deepEqual(weekStreak([...metas, act(day(2026, 9, 20))], now), { current: 4, best: 4 });
  assert.deepEqual(weekStreak([act(day(2026, 8, 1))], now), { current: 0, best: 1 });
  assert.deepEqual(weekStreak([], now), { current: 0, best: 0 });
});

test('yearRecap: totals, active days, busiest month, longest, sports', () => {
  const metas = [act(day(2026, 2, 1)), act(day(2026, 2, 1, 18), { sport: 'ride', distance: 40000, movingTime: 5400 }), act(day(2026, 5, 3)), act(day(2025, 5, 3))];
  const r = yearRecap(metas, 2026);
  assert.equal(r.count, 3);
  assert.equal(r.distance, 60000);
  assert.equal(r.days, 2);
  assert.equal(r.month, 2);
  assert.equal(r.longest.sport, 'ride');
  assert.deepEqual(r.sports.map((s) => s.sport), ['run', 'ride']);
  assert.equal(yearRecap([], 2026).month, null);
});

test('filterActivities: words anywhere, accents ignored, sport, dates, distance', () => {
  const metas = [
    act(day(2026, 0, 5), { name: 'Footing au bord du Lac' }),
    act(day(2026, 1, 5), { name: 'Sortie vélo', sport: 'ride', distance: 50000 }),
    act(day(2026, 2, 5), { name: 'Fractionné', description: 'Piste du stade' }),
  ];
  const names = (f) => filterActivities(metas, f).map((a) => a.name);
  assert.deepEqual(names({ q: 'lac footing' }), ['Footing au bord du Lac']);
  assert.deepEqual(names({ q: 'fractionne' }), ['Fractionné']);
  assert.deepEqual(names({ q: 'stade' }), ['Fractionné']);
  assert.deepEqual(names({ sport: 'ride' }), ['Sortie vélo']);
  assert.deepEqual(names({ from: day(2026, 1, 1), to: day(2026, 2, 1) }), ['Sortie vélo']);
  assert.deepEqual(names({ min: 20000 }), ['Sortie vélo']);
  assert.deepEqual(names({ max: 20000 }).length, 2);
  assert.equal(names({}).length, 3);
});

test('indoor recording: samples without a position, saved as a track-less activity', () => {
  let rec = startRecording({ sport: 'run', indoor: true, autoPause: true, safety: true }, 0);
  assert.equal(rec.autoPause, false);
  assert.equal(rec.safety, false);
  assert.equal(addReadings(rec, {}, 6000), rec); // nothing to keep without readings
  for (let t = 1000; t <= 120000; t += 1000) rec = addReadings(rec, { hr: 140 }, t);
  assert.equal(rec.points.length, 24); // one every 5 s
  assert.equal(rec.points[0].lat, undefined);
  const now = 120000;
  const { meta, points } = indoorActivity({ sport: rec.sport, samples: [{ time: rec.start }, ...rec.points, { time: now }], movingTime: Math.round(elapsed(rec, now)), source: 'record' });
  assert.equal(points.length, 0);
  assert.equal(meta.movingTime, 120);
  assert.equal(meta.avgHr, 140);
  assert.equal(meta.source, 'record');
});

test('weather: sky groups and the formatted line', () => {
  assert.equal(sky(0).icon, '☀️');
  assert.equal(sky(63).label, 'Pluie');
  assert.equal(sky(96).label, 'Orage');
  assert.equal(fmtWeather({ temp: 17.6, wind: 3.4, humidity: 62.4, code: 2 }), '⛅ Nuageux · 18 °C · vent 12 km/h · 62 %');
});
