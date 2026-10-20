import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cadenceMeter, parseCsc, parseHeartRate, parsePower } from '../src/lib/sensors.js';

test('parseHeartRate reads 8-bit and 16-bit heart rate values', () => {
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x00, 142]).buffer)), 142);
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x01, 0x2c, 0x01]).buffer)), 300);
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x16, 75, 0x10, 0x03]).buffer)), 75); // RR intervals follow
});

const view = (bytes) => new DataView(new Uint8Array(bytes).buffer);

test('parseCsc reads crank data, after wheel data when present', () => {
  assert.deepEqual(parseCsc(view([0x02, 10, 0, 0x00, 0x04])), { revs: 10, time: 1024 });
  assert.deepEqual(parseCsc(view([0x03, 1, 0, 0, 0, 0, 0, 0xff, 0xff, 0x00, 0x08])), { revs: 0xffff, time: 2048 });
  assert.equal(parseCsc(view([0x01, 1, 0, 0, 0, 0, 0])), null); // speed only
});

test('parsePower reads watts and the crank data behind optional fields', () => {
  assert.deepEqual(parsePower(view([0x00, 0x00, 250, 0])), { power: 250 });
  // Pedal balance (bit 0) and crank data (bit 5).
  assert.deepEqual(parsePower(view([0x21, 0x00, 0x2c, 0x01, 50, 5, 0, 0x00, 0x04])), { power: 300, crank: { revs: 5, time: 1024 } });
});

test('cadenceMeter: rpm from crank deltas, counters wrap, 0 when the cranks stop', () => {
  const cad = cadenceMeter();
  assert.equal(cad({ revs: 0xffff, time: 0xfc00 }), undefined); // first sample
  assert.equal(cad({ revs: 1, time: 0x0400 }), 60); // 2 turns in 2 s, both counters wrapped
  assert.equal(cad({ revs: 1, time: 0x0400 }), undefined);
  assert.equal(cad({ revs: 1, time: 0x0400 }), undefined);
  assert.equal(cad({ revs: 1, time: 0x0400 }), 0);
  assert.equal(cad(null), undefined);
});
