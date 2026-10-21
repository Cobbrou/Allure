// Routes made for you: loops from a start point, close to a target distance, ranked by the
// athlete's preferences (flat or hilly, paved or trails, familiar or new ground).

import { RAD } from './geo.js';

const M_PER_DEG = 111195;
const WIGGLE = 1.25; // routed length over the circle drawn through the waypoints (roads aren't straight)
export const FALLBACK_START = [6.8696, 45.9237]; // Chamonix, where the demo history lives
export const BEARINGS = [0, 60, 120, 180, 240, 300];

/**
 * Promise.allSettled over `items` with at most `limit` calls of fn running at once: the
 * public routing server answers a burst of requests with 429 (too many requests).
 */
export async function settleLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (let i; (i = next++) < items.length;) {
      try { out[i] = { status: 'fulfilled', value: await fn(items[i]) }; } catch (reason) { out[i] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

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

// Effort in flat-equivalent km (100 m of climbing ~ 1 km) where medium, then hard, begins.
const LEVELS = { run: [8, 16], ride: [40, 90], hike: [10, 20] };

/** 'easy' | 'medium' | 'hard' for a route of `distance` m climbing `gain` m. */
export function difficulty(distance, gain, sport) {
  const effort = distance / 1000 + (gain ?? 0) / 100;
  const [medium, hard] = LEVELS[sport] ?? LEVELS.run;
  return effort < medium ? 'easy' : effort < hard ? 'medium' : 'hard';
}

const PACE = { run: [10, 600], ride: [20, 800], hike: [4.5, 600] }; // km/h on the flat, m climbed per extra hour

/** Expected moving time (s) of a route, Naismith-style: flat speed plus time for the climbing. */
export function estimateTime(distance, gain, sport) {
  const [kmh, climb] = PACE[sport] ?? PACE.run;
  return 3600 * (distance / 1000 / kmh + (gain ?? 0) / climb);
}

/**
 * Lower is better. candidate: { distance, gain, unpaved, familiar }; prefs: { distance, sport,
 * terrain: 'flat' | 'hilly' | '', surface: 'paved' | 'trail' | '', level: '' | difficulty(), discover: bool }.
 */
export function score(c, prefs) {
  let s = Math.abs(c.distance - prefs.distance) / prefs.distance;
  const climb = (c.gain ?? 0) / (c.distance / 1000); // m per km
  if (prefs.terrain === 'flat') s += climb / 40;
  if (prefs.terrain === 'hilly') s -= Math.min(climb, 40) / 80;
  if (prefs.surface === 'paved') s += (c.unpaved ?? 0) * 0.5;
  if (prefs.surface === 'trail') s += (1 - (c.unpaved ?? 0)) * 0.5;
  if (prefs.level && difficulty(c.distance, c.gain, prefs.sport) !== prefs.level) s += 0.5;
  if (prefs.discover) s += c.familiar * 0.4;
  return s;
}

/** The `n` best candidates, by score. */
export const rank = (candidates, prefs, n = 3) =>
  candidates.map((c) => ({ ...c, score: score(c, prefs) })).sort((a, b) => a.score - b.score).slice(0, n);
