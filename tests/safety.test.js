import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertText, checkIn, cleanPhone, smsUrl } from '../src/lib/safety.js';

const rec = { paused: false, lastMove: 0, pos: { lat: 45.92371, lon: 6.86961, time: 0 } };
const opts = { after: 300000, grace: 60000 };

test('checkIn stays quiet while moving or paused', () => {
  assert.equal(checkIn(rec, 299999, 0, opts), null);
  assert.equal(checkIn({ ...rec, paused: true }, 10 * 60000, 0, opts), null);
});

test('checkIn asks, then alerts once the grace period is over', () => {
  assert.deepEqual(checkIn(rec, 300000, 0, opts), { stage: 'ask', left: 60 });
  assert.deepEqual(checkIn(rec, 330500, 0, opts), { stage: 'ask', left: 30 });
  assert.deepEqual(checkIn(rec, 360000, 0, opts), { stage: 'alert' });
});

test('answering "all good" restarts the countdown', () => {
  assert.equal(checkIn(rec, 400000, 350000, opts), null);
  assert.equal(checkIn(rec, 650000, 350000, opts)?.stage, 'ask');
});

test('alertText gives the stillness and a map link', () => {
  const text = alertText(rec, 7 * 60000);
  assert.match(text, /depuis 7 min/);
  assert.match(text, /mlat=45\.92371&mlon=6\.86961/);
  assert.match(alertText({ ...rec, pos: null }, 60000), /indisponible/);
  assert.match(alertText(rec, 0, true), /besoin d'aide.*mlat=/);
});

test('cleanPhone keeps digits and a leading plus', () => {
  assert.equal(cleanPhone(' +33 6 12-34.56 78 '), '+33612345678');
  assert.equal(cleanPhone('06 12 34 56 78'), '0612345678');
  assert.equal(cleanPhone('1+2'), null);
  assert.equal(cleanPhone('abc'), null);
});

test('smsUrl lists every number and encodes the body', () => {
  assert.equal(smsUrl([{ phone: '+331' }, { phone: '0612' }], 'a b&c'), 'sms:+331,0612?body=a%20b%26c');
});
