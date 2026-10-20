// Privacy zones: places (home, work) where shared activities must not show where they
// start or end. The stretch of track inside a zone at either end is hidden.
//
// Cutting exactly on a circle centred on the home would let anyone find it from two or
// three shared tracks (the cut points lie on that circle). So the circle is moved away from
// the place by a fixed secret offset, and each track is cut a little further on.

import { haversine } from './geo.js';

export const ZONE_RADII = [200, 400, 800, 1600]; // m

const M_PER_DEG = 111195;

/** Deterministic number in [0, 1) from a string (FNV-1a): same zone, same answer. */
const unit = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 2 ** 32;
};

/**
 * Centre of the hidden circle: the zone's point moved 25 to 50 % of the radius in a
 * direction derived from the zone id. Fixed per zone, so repeated shares can't average it
 * out; the place stays inside the circle, at least half a radius from its edge.
 */
export function zoneCentre(z) {
  if (!z.id) return z;
  const angle = 2 * Math.PI * unit(`${z.id}:angle`);
  const dist = z.radius * (0.25 + 0.25 * unit(`${z.id}:dist`));
  return {
    lat: z.lat + (dist * Math.cos(angle)) / M_PER_DEG,
    lon: z.lon + (dist * Math.sin(angle)) / (M_PER_DEG * Math.cos(z.lat * Math.PI / 180)),
  };
}

/**
 * `points` without the leading and trailing points inside any zone ({ id, lat, lon, radius }),
 * nor the next 0 to 50 % of the radius of track after leaving it (per track and zone, so the
 * cut points don't draw the circle).
 */
export function hidePrivate(points, zones) {
  if (!zones?.length || !points.length) return points;
  const circles = zones.map((z) => ({ ...zoneCentre(z), radius: z.radius, id: z.id ?? '' }));
  const zoneOf = (p) => circles.find((c) => haversine(p, c) <= c.radius);
  const key = String(points[0].time ?? `${points[0].lat},${points[0].lon}`);
  // Index past the zone at one end, walking by `step` (1 from the start, -1 from the end).
  const trim = (i, step, end) => {
    let zone;
    for (let z; i !== end && (z = zoneOf(points[i])); i += step) zone = z;
    if (!zone) return i;
    let extra = zone.radius * 0.5 * unit(`${zone.id}:${key}:${step}`);
    for (; i !== end && i + step !== end && extra > 0; i += step) extra -= haversine(points[i], points[i + step]);
    return i;
  };
  const a = trim(0, 1, points.length);
  const b = trim(points.length - 1, -1, a - 1) + 1;
  return points.slice(a, Math.max(a, b));
}
