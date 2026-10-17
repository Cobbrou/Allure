import { haversine } from './geo.js';

/**
 * [lon, lat] pairs keeping a point only once it is `gap` meters from the last kept one.
 * The heatmap draws every track at once: 1 s GPS fixes would be 10× more vertices than
 * the map needs at street zoom.
 */
export function thin(points, gap = 15) {
  const out = [];
  let last;
  for (const p of points) {
    if (last && haversine(last, p) < gap) continue;
    out.push([Math.round(p.lon * 1e5) / 1e5, Math.round(p.lat * 1e5) / 1e5]);
    last = p;
  }
  const end = points.at(-1);
  if (end && last !== end) out.push([Math.round(end.lon * 1e5) / 1e5, Math.round(end.lat * 1e5) / 1e5]);
  return out;
}

/**
 * The lines starting in the ~50 km cell holding the most starts: the map opens on the
 * athlete's home area instead of zooming out to fit one trip abroad.
 */
export function homeLines(lines) {
  const cells = new Map();
  for (const l of lines) {
    const [lon, lat] = l.coords[0];
    const key = `${Math.floor(lon * 2)}|${Math.floor(lat * 2)}`;
    cells.set(key, [...(cells.get(key) ?? []), l]);
  }
  return [...cells.values()].reduce((a, b) => (b.length > a.length ? b : a), []);
}
