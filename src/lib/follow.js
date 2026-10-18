// Following a planned route while recording: where the athlete is along it, how far is
// left, and whether they strayed off it.

import { t } from './i18n.js';
import { haversine, RAD } from './geo.js';
import { thin } from './heatmap.js';

const OFF = 50; // m from the route line to count as off route
const BACK = 30; // m to count as back on it (hysteresis, so GPS noise doesn't flap)
const AHEAD = 1000; // m of route searched past the last known position
const END = 30; // m before the end of the route to count it as done (route.end overrides)
const CLOSER = 5; // m a later stretch must be closer by to win over an earlier one (overlapping passes)
const DECIDE = 200; // m of progress that settle which way the route is followed

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
 * Forward only: followStep handles a route run the other way.
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

/** The same route run the other way. */
export function reverseRoute(route) {
  return { ...route, coords: [...route.coords].reverse(), cum: route.cum.map((c) => route.distance - c).reverse() };
}

const onAlong = (s) => (s && !s.off ? s.along : null);
const gain = (s, base) => (s && !s.off && base != null ? s.along - base : 0);

/**
 * One fix of route following, either way round. alt: { f, r, f0, r0 } while the direction is
 * unsettled: progress forward (f) and on the reversed route (r), and where each first joined
 * it. The first to gain DECIDE m wins, its route is kept and alt becomes null. Until then the
 * one ahead is shown, never done (a reversed point-to-point starts at the forward end).
 * Returns { route, follow, alt }.
 */
export function followStep(route, follow, alt, pos) {
  if (!alt) return { route, follow: progress(route, pos, follow), alt: null };
  const back = reverseRoute(route);
  const f = progress(route, pos, alt.f), r = progress(back, pos, alt.r);
  const f0 = alt.f0 ?? onAlong(f), r0 = alt.r0 ?? onAlong(r);
  const gf = gain(f, f0), gr = gain(r, r0);
  if (gr >= DECIDE) return { route: back, follow: r, alt: null };
  if (gf >= DECIDE) return { route, follow: f, alt: null };
  // Tie (at the start): the one with more route ahead.
  const shown = gr > gf || (gr === gf && (r?.along ?? Infinity) < (f?.along ?? Infinity)) ? r : f;
  return { route, follow: shown && { ...shown, done: false }, alt: { f, r, f0, r0 } };
}

/** Spoken message when following state changes between two recordings, else null. */
export function followCue(prev, next) {
  const a = prev?.follow, b = next?.follow;
  if (!b) return null;
  if (b.done && !a?.done) return t('Itinéraire terminé.');
  if (b.off && a && !a.off) return t("Vous avez quitté l'itinéraire."); // not at the start: still on the way to it
  if (!b.off && a?.off) return t("De retour sur l'itinéraire.");
  return null;
}
