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
