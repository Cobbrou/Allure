// Privacy zones: places (home, work) where shared activities must not show where they
// start or end. The stretch of track inside a zone at either end is hidden.

import { haversine } from './geo.js';

export const ZONE_RADII = [200, 400, 800, 1600]; // m

/** `points` without the leading and trailing points inside any zone ({ lat, lon, radius }). */
export function hidePrivate(points, zones) {
  if (!zones?.length) return points;
  const inside = (p) => zones.some((z) => haversine(p, z) <= z.radius);
  let a = 0, b = points.length;
  while (a < b && inside(points[a])) a++;
  while (b > a && inside(points[b - 1])) b--;
  return points.slice(a, b);
}
