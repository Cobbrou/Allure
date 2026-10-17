// Platform module: offline maps. Every map loads its style through a `cached://` protocol
// that answers from Cache Storage first, then the network. Downloading a route stores the
// style, sprite, glyphs and the vector tiles of a corridor around it, one cache per route.

import { addProtocol } from 'maplibre-gl';
import { tilesAlong } from './geo.js';
import { MAP_STYLE as STYLE_URL } from '../theme.js';

const SCHEME = 'cached://';
const toHttps = (url) => url.replace(SCHEME, 'https://');
const toCached = (url) => url.replace('https://', SCHEME);
const cacheName = (routeId) => `allure-route-${routeId}`;

// Corridor around the route. Carto tiles stop at z14 and overzoom beyond, so z14 is street level.
const ZOOMS = { minZoom: 5, maxZoom: 14, buffer: 800 };
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447']; // Latin, Latin Extended, punctuation (’ in place names)
const PARALLEL = 6;
const DONE = '/offline-complete'; // marker entry, see downloadRoute

/** Style URL every map uses. */
export const MAP_STYLE = toCached(STYLE_URL);

/** Point the style's sources, sprite and glyphs (or a TileJSON's tiles) at the cached scheme. */
function rewrite(json) {
  if (json.tiles) return { ...json, tiles: [toCached(json.tiles[0])] }; // one subdomain: stable cache keys
  if (!json.sources) return json;
  const sources = Object.fromEntries(Object.entries(json.sources).map(([k, s]) => [k, s.url ? { ...s, url: toCached(s.url) } : s]));
  return { ...json, sources, sprite: toCached(json.sprite), glyphs: toCached(json.glyphs) };
}

async function cachedFetch(url, signal) {
  const hit = typeof caches !== 'undefined' && (await caches.match(url));
  if (hit) return hit;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

addProtocol('cached', async (params, abort) => {
  const url = toHttps(params.url);
  const res = await cachedFetch(url, abort.signal);
  if (params.type === 'json') return { data: rewrite(await res.json()) };
  if (params.type === 'string') return { data: await res.text() };
  return { data: await res.arrayBuffer() };
});

const getJson = async (url) => (await cachedFetch(url)).json();

/** Fontstacks (text-font joined like MapLibre does) used by a style's layers. */
const fontstacks = (style) => [...new Set(style.layers.map((l) => l.layout?.['text-font']).filter(Array.isArray).map((f) => f.join(',')))];

/** Every URL the map needs to draw a route's corridor offline. */
async function urlsFor(points) {
  const style = await getJson(STYLE_URL);
  const tileUrls = [];
  for (const s of Object.values(style.sources)) {
    if (!s.url) continue;
    const template = (await getJson(s.url)).tiles[0];
    tileUrls.push(s.url, ...tilesAlong(points, ZOOMS).map(({ z, x, y }) => template.replace('{z}', z).replace('{x}', x).replace('{y}', y)));
  }
  const ratio = devicePixelRatio > 1 ? '@2x' : '';
  const glyphs = fontstacks(style).flatMap((f) => GLYPH_RANGES.map((r) => style.glyphs.replace('{fontstack}', f).replace('{range}', r)));
  return [STYLE_URL, `${style.sprite}${ratio}.json`, `${style.sprite}${ratio}.png`, ...glyphs, ...tileUrls];
}

/**
 * Download a route's map for offline use. onProgress(done, total). Resolves with { bytes, at }.
 * A failed tile is skipped (the map shows a hole there); the download goes on.
 */
export async function downloadRoute(route, points, onProgress = () => {}) {
  const urls = await urlsFor(points);
  const cache = await caches.open(cacheName(route.id));
  let next = 0, done = 0, bytes = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const res = await fetch(url);
        if (res.ok) {
          const body = await res.clone().arrayBuffer();
          bytes += body.byteLength;
          await cache.put(url, res);
        }
      } catch { /* offline or blocked tile: skip it */ }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const info = { bytes, at: Date.now() };
  await cache.put(DONE, Response.json(info)); // written last: a cut-off download has no marker
  return info;
}

/** { bytes, at } of a route's finished download, or null. */
export async function offlineInfo(routeId) {
  if (typeof caches === 'undefined' || !(await caches.has(cacheName(routeId)))) return null;
  const res = await (await caches.open(cacheName(routeId))).match(DONE);
  return res ? res.json() : null;
}

export const removeOffline = (routeId) => (typeof caches !== 'undefined' ? caches.delete(cacheName(routeId)) : Promise.resolve(false));
