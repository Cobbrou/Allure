// Planned routes: waypoints tapped on the map, joined by legs snapped to roads and trails.
// Platform module for the network part: legs come from BRouter (OpenStreetMap routing,
// free, CORS-enabled), which also returns the elevation of every point.

import { analyze } from './analyze.js';
import { preview } from './activity.js';

const BROUTER = 'https://brouter.de/brouter';
// BRouter profiles: trekking favors cycle-friendly roads, hiking-mountain takes paths and trails.
const PROFILE = { ride: 'trekking' };

/** Cache key of the leg a -> b ([lon, lat] waypoints). */
export const legKey = (a, b, sport, snap) => `${snap ? PROFILE[sport] ?? 'hiking-mountain' : 'line'}:${a}:${b}`;

export const straightLeg = (a, b) => [{ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }];

export function legUrl(a, b, sport) {
  return `${BROUTER}?lonlats=${a.join(',')}|${b.join(',')}&profile=${PROFILE[sport] ?? 'hiking-mountain'}&alternativeidx=0&format=geojson`;
}

/** Points { lon, lat, ele } of a BRouter GeoJSON answer. */
export function parseLeg(geojson) {
  const coords = geojson?.features?.[0]?.geometry?.coordinates;
  if (!(coords?.length > 1)) throw new Error('Itinéraire introuvable');
  return coords.map(([lon, lat, ele]) => ({ lon, lat, ele: Number.isFinite(ele) ? ele : null }));
}

export async function fetchLeg(a, b, sport) {
  const res = await fetch(legUrl(a, b, sport));
  if (!res.ok) throw new Error(`Routage indisponible (${res.status})`);
  return parseLeg(await res.json());
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
