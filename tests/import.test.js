import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { Encoder, Profile } from '@garmin/fitsdk';
import { dupKey } from '../src/lib/activity.js';
import { parseCsv } from '../src/lib/formats/csv.js';
import { parseFit } from '../src/lib/formats/fit.js';
import { readZip } from '../src/lib/formats/zip.js';
import { collectTasks } from '../src/lib/importer.js';

/** Small FIT activity: `n` records 1 s apart heading north from Chamonix. */
function fitFile(n = 30, sport = 'cycling') {
  const e = new Encoder();
  const t0 = new Date('2026-10-01T08:00:00Z');
  e.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: 'activity', manufacturer: 'development', product: 0, timeCreated: t0, serialNumber: 1 });
  for (let i = 0; i < n; i++) {
    e.writeMesg({
      mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(+t0 + i * 1000),
      positionLat: Math.round(((45.9 + i * 0.00005) / 180) * 2 ** 31), positionLong: Math.round((6.87 / 180) * 2 ** 31),
      altitude: 1040 + i, heartRate: 130 + (i % 5),
    });
  }
  e.writeMesg({ mesgNum: Profile.MesgNum.SESSION, timestamp: t0, startTime: t0, sport, totalElapsedTime: n, totalTimerTime: n });
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

test('parseFit converts semicircles, altitude, HR and sport', () => {
  const { type, points } = parseFit(fitFile(10));
  assert.equal(type, 'cycling');
  assert.equal(points.length, 10);
  assert.ok(Math.abs(points[0].lat - 45.9) < 1e-6 && Math.abs(points[0].lon - 6.87) < 1e-6);
  assert.equal(points[3].ele, 1043);
  assert.equal(points[0].hr, 130);
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

test('dupKey matches same start and distance', () => {
  assert.equal(dupKey({ date: 1000_400, distance: 5003 }), dupKey({ date: 1000_100, distance: 5001 }));
  assert.notEqual(dupKey({ date: 1000_000, distance: 5000 }), dupKey({ date: 1000_000, distance: 5100 }));
});
