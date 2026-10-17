// Routes made for you: loops from a start point, close to a target distance, ranked by the
// athlete's preferences (flat or hilly, paved or trails, familiar or new ground).

import { RAD } from './geo.js';

const M_PER_DEG = 111195;
const WIGGLE = 1.25; // routed length over the circle drawn through the waypoints (roads aren't straight)
export const BEARINGS = [0, 60, 120, 180, 240, 300];

/** The point `d` meters from [lon, lat] towards `bearing` degrees (flat approximation). */
export function offset([lon, lat], d, bearing) {
  const b = bearing * RAD;
  return [
    Math.round((lon + (d * Math.sin(b)) / (M_PER_DEG * Math.cos(lat * RAD))) * 1e6) / 1e6,
    Math.round((lat + (d * Math.cos(b)) / M_PER_DEG) * 1e6) / 1e6,
  ];
}

/**
 * Waypoints of a loop of about `distance` m from `start`, heading out towards `bearing`:
 * points on a circle through the start, ending back at the start. `scale` corrects the
 * radius once a first routing came out too long or too short.
 */
export function loopWaypoints(start, distance, bearing, scale = 1, n = 4) {
  const r = (distance * scale) / (2 * Math.PI * WIGGLE);
  const center = offset(start, r, bearing);
  const back = bearing + 180; // bearing from the center to the start
  const vias = Array.from({ length: n - 1 }, (_, k) => offset(center, r, back + ((k + 1) * 360) / n));
  return [start, ...vias, start];
}

const CELL = 0.001; // ° (~100 m) grid used to compare a route with past tracks

export const cellKey = (lon, lat) => `${Math.round(lon / CELL)}:${Math.round(lat / (CELL * 0.7))}`;

/** Share (0..1) of route points in cells the athlete's tracks already cover. */
export function familiarity(points, cells) {
  if (!cells?.size || !points.length) return 0;
  return points.filter((p) => cells.has(cellKey(p.lon, p.lat))).length / points.length;
}

/**
 * Lower is better. candidate: { distance, gain, unpaved, familiar }; prefs: { distance,
 * terrain: 'flat' | 'hilly' | '', surface: 'paved' | 'trail' | '', discover: bool }.
 */
export function score(c, prefs) {
  let s = Math.abs(c.distance - prefs.distance) / prefs.distance;
  const climb = (c.gain ?? 0) / (c.distance / 1000); // m per km
  if (prefs.terrain === 'flat') s += climb / 40;
  if (prefs.terrain === 'hilly') s -= Math.min(climb, 40) / 80;
  if (prefs.surface === 'paved') s += (c.unpaved ?? 0) * 0.5;
  if (prefs.surface === 'trail') s += (1 - (c.unpaved ?? 0)) * 0.5;
  if (prefs.discover) s += c.familiar * 0.4;
  return s;
}

/** The `n` best candidates, by score. */
export const rank = (candidates, prefs, n = 3) =>
  candidates.map((c) => ({ ...c, score: score(c, prefs) })).sort((a, b) => a.score - b.score).slice(0, n);
