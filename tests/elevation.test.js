import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleElevation, terrarium, tilesFor, worldPx } from '../src/lib/elevation.js';

// Terrarium RGBA tile whose pixel (x, y) encodes height h(x, y), x/y global pixels.
const tile = (tx, ty, h) => {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = h(tx * 256 + x, ty * 256 + y) + 32768;
    const i = (y * 256 + x) * 4;
    data[i] = Math.floor(v / 256); data[i + 1] = Math.floor(v % 256); data[i + 2] = Math.round((v % 1) * 256);
  }
  return data;
};

test('terrarium decoding and Web Mercator pixels', () => {
  assert.equal(terrarium(128, 0, 0), 0);
  assert.equal(terrarium(129, 44, 128), 300.5);
  assert.deepEqual(worldPx(0, 0, 0), [128, 128]);
  const [x] = worldPx(45, 6, 12);
  assert.equal(Math.floor(x / 256), 2116); // tile of Annecy-ish longitude at z12
});

test('bilinear sampling, across a tile edge', () => {
  const [gx, gy] = worldPx(45.5, 6.25, 12);
  const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
  const h = (x) => 1000 + (x - tx * 256) * 2; // a ramp east, 2 m per pixel
  // A point exactly between the last pixel of one tile and the first of the next.
  const edge = { lon: ((tx + 1) * 256 / (256 * 2 ** 12)) * 360 - 180, lat: 45.5 };
  const keys = tilesFor([edge]);
  assert.ok(keys.has(`${tx}/${ty}`) && keys.has(`${tx + 1}/${ty}`), [...keys].join());
  const tiles = new Map([...keys].map((k) => [k, tile(...k.split('/').map(Number), h)]));
  const [ele] = sampleElevation([edge], tiles);
  assert.ok(Math.abs(ele - (1000 + 255.5 * 2)) < 0.2, ele); // halfway between 1510 and 1512
  assert.equal(sampleElevation([edge], new Map()), null);
});
