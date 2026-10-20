import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { Encoder, Profile } from '@garmin/fitsdk';
import { indoorActivity, isDuplicate } from '../src/lib/activity.js';
import { parseCsv } from '../src/lib/formats/csv.js';
import { parseFit } from '../src/lib/formats/fit.js';
import { readZip } from '../src/lib/formats/zip.js';
import { collectTasks, fromHealthWorkout, healthTasks } from '../src/lib/importer.js';

/** Small FIT activity: `n` records 1 s apart heading north from Chamonix, two laps. */
function fitFile(n = 30, sport = 'cycling', gps = true) {
  const e = new Encoder();
  const t0 = new Date('2026-10-01T08:00:00Z');
  e.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: 'activity', manufacturer: 'development', product: 0, timeCreated: t0, serialNumber: 1 });
  for (let i = 0; i < n; i++) {
    e.writeMesg({
      mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(+t0 + i * 1000),
      ...(gps && { positionLat: Math.round(((45.9 + i * 0.00005) / 180) * 2 ** 31), positionLong: Math.round((6.87 / 180) * 2 ** 31) }),
      distance: i * 5, altitude: 1040 + i, heartRate: 130 + (i % 5), power: 200 + i,
    });
  }
  for (const k of [0, Math.floor(n / 2)]) e.writeMesg({ mesgNum: Profile.MesgNum.LAP, timestamp: t0, startTime: new Date(+t0 + k * 1000) });
  e.writeMesg({ mesgNum: Profile.MesgNum.SESSION, timestamp: t0, startTime: t0, sport, totalElapsedTime: n, totalTimerTime: n, totalDistance: (n - 1) * 5 });
  return e.close();
}

/** Minimal ZIP writer for tests (deflate, CRC left at 0: the reader doesn't check it). */
function zip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = enc.encode(name), body = deflateRawSync(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, body); centrals.push(central, n);
    offset += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('parseFit converts semicircles, altitude, HR, power, sport and laps', () => {
  const { type, points, laps } = parseFit(fitFile(10));
  assert.deepEqual(laps.map((t) => t - points[0].time), [0, 5000]);
  assert.equal(type, 'cycling');
  assert.equal(points.length, 10);
  assert.ok(Math.abs(points[0].lat - 45.9) < 1e-6 && Math.abs(points[0].lon - 6.87) < 1e-6);
  assert.equal(points[3].ele, 1043);
  assert.equal(points[0].hr, 130);
  assert.equal(points[2].power, 202);
  assert.equal(points[1].time - points[0].time, 1000);
});

test('parseCsv handles quotes, commas and newlines', () => {
  const rows = parseCsv('a,b,c\r\n1,"x, ""y""",z\n2,"multi\nline",\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, "y"', c: 'z' }, { a: '2', b: 'multi\nline', c: '' }]);
});

test('Strava archive: zip + activities.csv + gzipped FIT', async () => {
  const csv = 'Activity ID,Activity Date,Activity Name,Activity Type,Filename\n1,"Oct 1, 2026","Col des ""Montets""",Ride,activities/1.fit.gz\n';
  const archive = new Blob([zip({
    'activities.csv': Buffer.from(csv),
    'activities/1.fit.gz': gzipSync(fitFile()),
    'media/photo.jpg': Buffer.from('not an activity'),
  })]);
  const entries = await readZip(archive);
  assert.deepEqual(entries.map((e) => e.name), ['activities.csv', 'activities/1.fit.gz', 'media/photo.jpg']);

  const file = new File([archive], 'export_123.zip');
  const tasks = await collectTasks([file]);
  assert.equal(tasks.length, 1);
  const parsed = await tasks[0].read();
  assert.equal(parsed.name, 'Col des "Montets"');
  assert.equal(parsed.type, 'Ride');
  assert.equal(parsed.points.length, 30);
});

test('isDuplicate matches overlapping sessions of the same sport', () => {
  const fit = { sport: 'run', date: 1_000_000, movingTime: 1800 };
  assert.ok(isDuplicate(fit, { sport: 'run', date: 1_060_000, movingTime: 1700 })); // Health Connect, a minute later
  assert.ok(!isDuplicate(fit, { sport: 'ride', date: 1_060_000, movingTime: 1700 }));
  assert.ok(!isDuplicate(fit, { sport: 'run', date: 1_000_000 + 1801_000, movingTime: 600 })); // right after
});

test('healthTasks keeps the sports Allure has, with or without a route', () => {
  const route = [{ timestamp: '2026-10-01T08:00:00Z', lat: 45.9, lng: 6.87 }, { timestamp: '2026-10-01T08:00:05Z', lat: 45.9001, lng: 6.87 }];
  const tasks = healthTasks([
    { workoutType: 'RUNNING', title: 'Footing', route },
    { workoutType: 'RUNNING_TREADMILL', route },
    { workoutType: 'BIKING' },
    { workoutType: 'YOGA', route },
  ]);
  assert.deepEqual(tasks.map((t) => t.label), ['Footing', 'RUNNING_TREADMILL', 'BIKING']);
});

test('fromHealthWorkout maps the route and takes the nearest heart rate within 10 s', () => {
  const w = {
    workoutType: 'BIKING', title: '',
    route: [
      { timestamp: '2026-10-01T08:00:10Z', lat: 45.9002, lng: 6.87, alt: 1042 },
      { timestamp: '2026-10-01T08:00:00Z', lat: 45.9, lng: 6.87 },
      { timestamp: '2026-10-01T08:01:00Z', lat: 45.9004, lng: 6.87, alt: 1045 },
    ],
    heartRate: [{ timestamp: '2026-10-01T08:00:09Z', bpm: 140 }, { timestamp: '2026-10-01T08:00:01Z', bpm: 120 }],
  };
  const r = fromHealthWorkout(w);
  assert.equal(r.name, undefined);
  assert.equal(r.source, 'healthconnect');
  assert.deepEqual(r.points.map((p) => [p.lat, p.ele, p.hr]), [[45.9, null, 120], [45.9002, 1042, 140], [45.9004, 1045, null]]);
  assert.equal(r.points[0].time, Date.parse('2026-10-01T08:00:00Z'));
});

test('an indoor FIT (no GPS) comes back as samples with the session totals', () => {
  const { type, samples, distance, movingTime, points } = parseFit(fitFile(10, 'training', false));
  assert.equal(points, undefined);
  assert.equal(type, 'training');
  assert.equal(samples.length, 10);
  assert.deepEqual([samples[2].hr, samples[2].dist, samples[2].power], [132, 10, 202]);
  assert.deepEqual([distance, movingTime], [45, 10]);
});

test('indoorActivity: track-less meta with HR, power and the given totals', () => {
  const samples = Array.from({ length: 61 }, (_, i) => ({ time: 1_000_000 + i * 1000, hr: 140, dist: i * 3, power: 180 }));
  const { meta, points } = indoorActivity({ sport: 'ride', samples, source: 'fit' });
  assert.deepEqual(points, []);
  assert.deepEqual([meta.date, meta.movingTime, meta.distance, meta.avgHr, meta.avgPower, meta.source], [1_000_000, 60, 180, 140, 180, 'fit']);
  assert.equal(meta.hrTime[140], 60);
  assert.equal(indoorActivity({ sport: 'run', samples, distance: 200, movingTime: 70 }).meta.movingTime, 70);
});

test('fromHealthWorkout without a route gives samples, duration and heart rate', () => {
  const r = fromHealthWorkout({
    workoutType: 'RUNNING_TREADMILL', startDate: '2026-10-01T08:00:00Z', endDate: '2026-10-01T08:30:00Z', duration: 1800,
    heartRate: [{ timestamp: '2026-10-01T08:10:00Z', bpm: 150 }],
  });
  assert.equal(r.points, undefined);
  assert.equal(r.movingTime, 1800);
  assert.deepEqual(r.samples.map((x) => x.hr ?? null), [null, 150, null]);
});
