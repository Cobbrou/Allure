import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHeartRate } from '../src/lib/sensors.js';

test('parseHeartRate reads 8-bit and 16-bit heart rate values', () => {
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x00, 142]).buffer)), 142);
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x01, 0x2c, 0x01]).buffer)), 300);
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x16, 75, 0x10, 0x03]).buffer)), 75); // RR intervals follow
});
