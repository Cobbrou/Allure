// Planned routes: waypoints tapped on the map, joined by legs snapped to roads and trails.
// Platform module for the network part: legs come from BRouter (OpenStreetMap routing,
// free, CORS-enabled), which also returns the elevation of every point.

import { t } from './i18n.js';
import { analyze } from './analyze.js';
import { preview } from './activity.js';
import { haversine } from './geo.js';

const BROUTER = 'https://brouter.de/brouter';
// BRouter profiles: trekking favors cycle-friendly roads, hiking-mountain takes paths and trails,
// fastbike (road bike) keeps to paved ways: used for any sport when roads are asked for.
const PROFILE = { ride: 'trekking' };
const profile = (sport, surface) => (surface === 'paved' ? 'fastbike' : PROFILE[sport] ?? 'hiking-mountain');

/** Cache key of the leg a -> b ([lon, lat] waypoints). */
export const legKey = (a, b, sport, snap) => `${snap ? profile(sport) : 'line'}:${a}:${b}`;

export const straightLeg = (a, b) => [{ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }];

/** BRouter URL for a route through [lon, lat] waypoints. surface: 'paved' to stay on roads. */
export const routeUrl = (lonlats, sport, surface) =>
  `${BROUTER}?lonlats=${lonlats.map((c) => c.join(',')).join('|')}&profile=${profile(sport, surface)}&alternativeidx=0&format=geojson`;

export const legUrl = (a, b, sport) => routeUrl([a, b], sport);

/** Points { lon, lat, ele } of a BRouter GeoJSON answer. */
export function parseLeg(geojson) {
  const coords = geojson?.features?.[0]?.geometry?.coordinates;
  if (!(coords?.length > 1)) throw new Error(t('Itinéraire introuvable'));
  return coords.map(([lon, lat, ele]) => ({ lon, lat, ele: Number.isFinite(ele) ? ele : null }));
}

async function fetchGeojson(url) {
  const res = await fetch(url);
  if (res.status === 429) throw new Error(t('Service de routage saturé : réessaie dans une minute.'));
  if (!res.ok) throw new Error(t('Routage indisponible ({status})', { status: res.status }));
  return res.json();
}

export const fetchLeg = async (a, b, sport) => parseLeg(await fetchGeojson(legUrl(a, b, sport)));

/** A whole route through waypoints in one request: { points, unpaved }. surface: as routeUrl. */
export async function fetchRoute(lonlats, sport, surface) {
  const json = await fetchGeojson(routeUrl(lonlats, sport, surface));
  return { points: parseLeg(json), unpaved: unpavedShare(json) };
}

const PAVED = new Set(['asphalt', 'paved', 'concrete', 'concrete:plates', 'paving_stones', 'sett', 'chipseal']);
const TRAIL = new Set(['track', 'path', 'bridleway']);

/** Share (0..1) of a BRouter route's distance on unpaved ways, from the OSM tags of its messages. */
export function unpavedShare(geojson) {
  const [head, ...rows] = geojson?.features?.[0]?.properties?.messages ?? [];
  if (!head) return null;
  const dCol = head.indexOf('Distance'), tCol = head.indexOf('WayTags');
  let all = 0, unpaved = 0;
  for (const r of rows) {
    const d = Number(r[dCol]) || 0;
    const tags = Object.fromEntries(String(r[tCol]).split(' ').map((t) => t.split('=')));
    all += d;
    if (tags.surface ? !PAVED.has(tags.surface) : TRAIL.has(tags.highway)) unpaved += d;
  }
  return all ? unpaved / all : null;
}

/**
 * Cut a point list routed through `waypoints` into one leg per waypoint pair, at the point
 * nearest each intermediate waypoint (searched in order), so the route can be edited later.
 */
export function splitLegs(points, waypoints) {
  const legs = [];
  let from = 0;
  for (const w of waypoints.slice(1, -1)) {
    let best = from, bestD = Infinity;
    for (let i = from; i < points.length; i++) {
      const d = (points[i].lon - w[0]) ** 2 + (points[i].lat - w[1]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    legs.push(points.slice(from, best + 1));
    from = best;
  }
  legs.push(points.slice(from));
  return legs;
}

/** One point list from consecutive legs, without repeating the waypoint shared by two legs. */
export const joinLegs = (legs) => legs.flatMap((leg, i) => (i ? leg.slice(1) : leg));

/**
 * A route record: waypoints and the leg between each pair (to edit it again without
 * routing it anew), plus stats and a thumbnail. Points to draw or export: joinLegs(legs).
 */
export function createRoute({ id = crypto.randomUUID(), name, sport, snap, waypoints, legs, created = Date.now() }) {
  const points = joinLegs(legs);
  const { distance, gain } = analyze(points);
  return { id, name, sport, snap, waypoints, legs, distance, gain, preview: preview(points), created, updated: Date.now() };
}

/** Routes sorted by how close they pass to [lon, lat] (nearest thumbnail point), nearest first. */
export function nearestFirst(routes, [lon, lat]) {
  const gap = (r) => Math.min(...r.preview.map(([x, y]) => haversine({ lon, lat }, { lon: x, lat: y })));
  return routes.map((r) => [gap(r), r]).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

const MAX_WAYPOINTS = 40; // editable handles on an imported track, at least 1 km apart

/**
 * A straight-line ("Ligne droite") route from a recorded or planned track (GPX, TCX, FIT): the
 * points kept as they are, cut into legs at waypoints spaced along the track so it can be
 * edited. Points { lat, lon, ele? }.
 */
export function routeFromPoints({ name, sport = 'run', points }) {
  const pts = points.map(({ lon, lat, ele }) => ({ lon, lat, ele: Number.isFinite(ele) ? ele : null }));
  let total = 0;
  const at = pts.map((p, i) => (total += i ? haversine(pts[i - 1], p) : 0));
  const step = Math.max(1000, total / MAX_WAYPOINTS);
  const idx = [0];
  for (let i = 1; i < pts.length - 1; i++) if (at[i] - at[idx.at(-1)] >= step && total - at[i] >= step / 2) idx.push(i);
  idx.push(pts.length - 1);
  const waypoints = idx.map((i) => [pts[i].lon, pts[i].lat]);
  const legs = idx.slice(1).map((j, k) => pts.slice(idx[k], j + 1));
  return createRoute({ name, sport, snap: false, waypoints, legs });
}

// Route links: a route travels as a URL-safe code holding its name, sport, waypoints and its
// line simplified to SIMPLIFY m (ELE_TOLERANCE m in height), so the receiver needs no account
// and no routing request. The receiver puts points back every DENSE m: elevation smoothing
// (`smoothEle`) averages a few points, too few points would flatten the climbs.
const SIMPLIFY = 5; // m
const ELE_TOLERANCE = 2; // m
const DENSE = 10; // m
const MAX_SHARED = 20000; // points accepted from a code (untrusted input)
const BUILDER_SPORTS = ['run', 'ride', 'hike', 'walk'];

/**
 * Indices of the points Douglas-Peucker keeps within `tol` m sideways and ELE_TOLERANCE m in
 * height (equirectangular metres, fine at route scale).
 */
function simplify(pts, tol) {
  const k = Math.cos((pts[0].lat * Math.PI) / 180) * 111195;
  const xy = pts.map((p) => [p.lon * k, p.lat * 111195]);
  const keep = new Set([0, pts.length - 1]);
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, max = tol;
    for (let i = a + 1; i < b; i++) {
      const along = Math.min(1, Math.max(0, ((xy[i][0] - ax) * (bx - ax) + (xy[i][1] - ay) * (by - ay)) / len ** 2));
      const dEle = pts[i].ele == null || pts[a].ele == null || pts[b].ele == null ? 0
        : Math.abs(pts[i].ele - (pts[a].ele + along * (pts[b].ele - pts[a].ele)));
      const d = Math.max(Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len, (dEle * tol) / ELE_TOLERANCE);
      if (d > max) { max = d; far = i; }
    }
    if (far > 0) { keep.add(far); stack.push([a, far], [far, b]); }
  }
  return [...keep].sort((x, y) => x - y);
}

// Integers as Google's polyline characters (zigzag, 5-bit groups): deltas stay a few chars each.
const putNum = (n) => {
  let v = n < 0 ? ~(n << 1) : n << 1, s = '';
  for (; v >= 0x20; v >>= 5) s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
  return s + String.fromCharCode(v + 63);
};
/** Rows of `width` integers, each column delta-encoded. */
const packRows = (rows, width) => {
  const prev = Array(width).fill(0);
  return rows.map((r) => r.map((v, i) => { const d = v - prev[i]; prev[i] = v; return putNum(d); }).join('')).join('');
};
function unpackRows(s, width) {
  const rows = [], prev = Array(width).fill(0);
  let row = [], i = 0;
  while (i < s.length) {
    let v = 0, shift = 0, c;
    do {
      c = s.charCodeAt(i++) - 63;
      if (!(c >= 0 && c < 64) || shift > 30) throw new Error('bad code');
      v |= (c & 0x1f) << shift;
      shift += 5;
    } while (c >= 0x20);
    const n = v & 1 ? ~(v >>> 1) : v >>> 1;
    row.push((prev[row.length] += n));
    if (row.length === width) { rows.push(row); row = []; }
  }
  if (row.length) throw new Error('bad code');
  return rows;
}
const E5 = 1e5;

/** The points with straight-line points added so that none are more than `step` m apart. */
export function densify(points, step = DENSE) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const n = Math.ceil(haversine(a, b) / step);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      out.push({ lon: a.lon + f * (b.lon - a.lon), lat: a.lat + f * (b.lat - a.lat), ele: a.ele == null || b.ele == null ? a.ele : a.ele + f * (b.ele - a.ele) });
    }
    out.push(b);
  }
  return out;
}

/** URL-safe code of a route (name, sport, waypoints, simplified line with elevation). */
export function encodeRoute({ name, sport, snap, waypoints, legs }) {
  const pts = joinLegs(legs);
  const line = simplify(pts, SIMPLIFY).map((i) => pts[i]);
  const json = JSON.stringify({
    v: 1, name, sport, snap,
    w: packRows(waypoints.map(([lon, lat]) => [Math.round(lat * E5), Math.round(lon * E5)]), 2),
    p: packRows(line.map((p) => [Math.round(p.lat * E5), Math.round(p.lon * E5), Math.round(p.ele ?? -9999)]), 3),
  });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A new route (fresh id) from a pasted link or code, or null when it isn't a valid one. */
export function decodeRoute(text) {
  const code = String(text).match(/route\/link\/([\w-]+)/)?.[1] ?? String(text).trim().split(/\s+/).pop();
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (x) => x.charCodeAt(0))));
    if (c?.v !== 1 || typeof c.w !== 'string' || typeof c.p !== 'string') return null;
    const waypoints = unpackRows(c.w, 2).map(([lat, lon]) => [lon / E5, lat / E5]);
    const points = unpackRows(c.p, 3).map(([lat, lon, ele]) => ({ lon: lon / E5, lat: lat / E5, ele: ele === -9999 ? null : ele }));
    const ok = (x, y) => Math.abs(x) <= 180 && Math.abs(y) <= 90;
    if (waypoints.length < 2 || points.length < 2 || points.length > MAX_SHARED || waypoints.length > points.length
      || ![...waypoints, ...points.map((p) => [p.lon, p.lat])].every(([x, y]) => ok(x, y))) return null;
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 120) : t('Itinéraire');
    const sport = BUILDER_SPORTS.includes(c.sport) ? c.sport : 'run';
    return createRoute({ name, sport, snap: c.snap === true, waypoints, legs: splitLegs(densify(points), waypoints) });
  } catch {
    return null;
  }
}
