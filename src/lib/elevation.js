// Elevation correction: phone GPS altitude is ellipsoid height (~50 m too high in France)
// and noisy, so recorded tracks take their altitude from the AWS Terrain DEM instead,
// the tiles the 3D map already uses. Platform module: fetches and decodes PNG tiles.
// ponytail: DEM ground height, so bridges dip and tunnels climb over the hill; a
// barometric watch track would be better left alone (imports aren't corrected).

import { DEM_TILES } from '../theme.js';

const Z = 12; // ~27 m per pixel at 45°: a 7 km tile, a few tiles for most activities
const SIZE = 256;
const MAX_TILES = 64; // beyond this (a long tour), keep the GPS altitude rather than download it all

/** Global Web Mercator pixel coordinates of a point at zoom z. */
export function worldPx(lat, lon, z = Z) {
  const n = SIZE * 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/** Height in meters of a terrarium-encoded pixel. */
export const terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

// The 4 pixels around a point (pixel centres sit at +0.5) and its offsets between them.
function around(p, z) {
  const [gx, gy] = worldPx(p.lat, p.lon, z);
  const x = Math.floor(gx - 0.5), y = Math.floor(gy - 0.5);
  return { x, y, fx: gx - 0.5 - x, fy: gy - 0.5 - y };
}

/** Keys "x/y" of the tiles needed to sample every point. */
export function tilesFor(points, z = Z) {
  const keys = new Set();
  for (const p of points) {
    const { x, y } = around(p, z);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) keys.add(`${Math.floor((x + dx) / SIZE)}/${Math.floor((y + dy) / SIZE)}`);
  }
  return keys;
}

/**
 * Bilinear DEM height at each point. tiles: Map of "x/y" to RGBA bytes (SIZE x SIZE).
 * Null when a needed tile is missing.
 */
export function sampleElevation(points, tiles, z = Z) {
  const px = (x, y) => {
    const data = tiles.get(`${Math.floor(x / SIZE)}/${Math.floor(y / SIZE)}`);
    if (!data) return null;
    const i = ((y % SIZE) * SIZE + (x % SIZE)) * 4;
    return terrarium(data[i], data[i + 1], data[i + 2]);
  };
  const out = [];
  for (const p of points) {
    const { x, y, fx, fy } = around(p, z);
    const a = px(x, y), b = px(x + 1, y), c = px(x, y + 1), d = px(x + 1, y + 1);
    if (a == null || b == null || c == null || d == null) return null;
    out.push(Math.round((a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy) * 10) / 10);
  }
  return out;
}

async function loadTile(key, signal) {
  const [x, y] = key.split('/');
  const res = await fetch(DEM_TILES.replace('{z}', Z).replace('{x}', x).replace('{y}', y), { signal });
  if (!res.ok) throw new Error(`DEM tile ${key}: ${res.status}`);
  const img = await createImageBitmap(await res.blob());
  const g = new OffscreenCanvas(SIZE, SIZE).getContext('2d');
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, SIZE, SIZE).data;
}

/** Points with their altitude from the DEM, or the same points when offline, slow or too long. */
export async function correctElevation(points, timeout = 5000) {
  const keys = tilesFor(points);
  if (!points.length || keys.size > MAX_TILES) return points;
  try {
    const signal = AbortSignal.timeout(timeout);
    const tiles = new Map(await Promise.all([...keys].map(async (k) => [k, await loadTile(k, signal)])));
    const ele = sampleElevation(points, tiles);
    return ele ? points.map((p, i) => ({ ...p, ele: ele[i] })) : points;
  } catch {
    return points; // offline or timed out: the GPS altitude is better than none
  }
}
