// Matched activities: other activities of the same sport over the same route. Found from
// the ~80-point previews stored in metas, so no track has to be loaded.

import { RAD } from './geo.js';

const TOLERANCE = 100; // m a preview point may sit off the other route
const COVERAGE = 0.9; // share of points that must be on the other route, both ways
const DISTANCE = 0.1; // max relative distance difference

// Equirectangular projection to meters around lat0: accurate enough at route scale.
const project = (preview, lat0) => preview.map(([lon, lat]) => [lon * 111320 * Math.cos(lat0 * RAD), lat * 110540]);

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** True when at least COVERAGE of `pts` lie within TOLERANCE of the polyline `line`. */
function covers(line, pts) {
  let miss = 0;
  for (const p of pts) {
    let near = false;
    for (let i = 1; i < line.length && !near; i++) near = segmentDistance(p, line[i - 1], line[i]) <= TOLERANCE;
    if (!near && ++miss > pts.length * (1 - COVERAGE)) return false;
  }
  return true;
}

/** Same sport, similar distance, and each route covers the other. Direction and start point are ignored. */
export function isMatch(a, b) {
  if (a.sport !== b.sport || !(a.preview?.length > 1 && b.preview?.length > 1)) return false;
  if (Math.abs(a.distance - b.distance) > DISTANCE * Math.max(a.distance, b.distance)) return false;
  const lat0 = a.preview[0][1];
  const pa = project(a.preview, lat0), pb = project(b.preview, lat0);
  return covers(pb, pa) && covers(pa, pb);
}

/** `meta` and its matches among `metas`, oldest first. */
export function matchedActivities(meta, metas) {
  return [meta, ...metas.filter((m) => m.id !== meta.id && isMatch(meta, m))].sort((x, y) => x.date - y.date);
}
