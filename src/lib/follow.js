// Following a planned route while recording: where the athlete is along it, how far is
// left, and whether they strayed off it.

import { haversine, RAD } from './geo.js';
import { thin } from './heatmap.js';

const OFF = 50; // m from the route line to count as off route
const BACK = 30; // m to count as back on it (hysteresis, so GPS noise doesn't flap)
const AHEAD = 1000; // m of route searched past the last known position
const END = 30; // m before the end of the route to count it as done (route.end overrides)
const CLOSER = 5; // m a later stretch must be closer by to win over an earlier one (overlapping passes)

/** The light copy of a route kept in a recording: [lon, lat] coords and cumulative meters. */
export function followRoute(route, points) {
  const coords = thin(points, 10);
  let d = 0;
  const cum = coords.map((c, i) => (d += i ? haversine(ll(coords[i - 1]), ll(c)) : 0));
  return { id: route.id, name: route.name, coords, cum, distance: d };
}

const ll = ([lon, lat]) => ({ lon, lat });

/** Distance in m from p to segment a-b, and the fraction along it (local flat projection). */
function toSegment(p, a, b) {
  const k = Math.cos(p.lat * RAD) * 111320;
  const ax = (a[0] - p.lon) * k, ay = (a[1] - p.lat) * 110540;
  const bx = (b[0] - p.lon) * k, by = (b[1] - p.lat) * 110540;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
  return { gap: Math.hypot(ax + t * dx, ay + t * dy), t };
}

/**
 * Position of `pos` along `route` given the previous state `prev` ({ i, along, off, done }
 * or null). On route, only the stretch just ahead is searched, so a loop or an out-and-back
 * doesn't jump to the wrong pass. Off route (or at the start), the whole route is searched,
 * taking the first stretch within reach, so a loop starts at its start, not its end.
 * ponytail: forward-only, so a route run in reverse reads as off route. Detect the
 * direction on the first few hundred meters (and flip coords) if athletes ask for it.
 */
export function progress(route, pos, prev) {
  const { coords, cum } = route;
  const local = prev && !prev.off;
  const from = local ? prev.i : 0;
  let best = null;
  for (let i = from; i < coords.length - 1; i++) {
    if (local && cum[i] > cum[from] + AHEAD) break;
    const s = toSegment(pos, coords[i], coords[i + 1]);
    if (!best || s.gap < best.gap - CLOSER) best = { i, ...s };
    if (!local && s.gap < BACK) break;
  }
  if (!best) return prev;
  const off = best.gap > (prev?.off ? BACK : OFF);
  // Off route, keep the last progress: the athlete has not covered the stretch they skipped.
  if (off) return { ...(prev ?? { i: 0, along: 0, done: false }), off, gap: best.gap };
  const along = cum[best.i] + best.t * (cum[best.i + 1] - cum[best.i]);
  return { i: best.i, along, off, gap: best.gap, done: prev?.done || along >= route.distance - (route.end ?? END) };
}

/** Spoken message when following state changes between two recordings, else null. */
export function followCue(prev, next) {
  const a = prev?.follow, b = next?.follow;
  if (!b) return null;
  if (b.done && !a?.done) return 'Itinéraire terminé.';
  if (b.off && a && !a.off) return "Vous avez quitté l'itinéraire."; // not at the start: still on the way to it
  if (!b.off && a?.off) return "De retour sur l'itinéraire.";
  return null;
}
