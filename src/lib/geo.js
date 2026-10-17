const R = 6371000;
export const RAD = Math.PI / 180;

/** Great-circle distance in meters between two {lat, lon} points. */
export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Scale [x, y] points uniformly to fit a { x, y, w, h } box, centered. stretch: also fill
 * the box height (independent y scale), for charts. Returns the projected points.
 */
export function fitToBox(pts, box, stretch = false) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const kx = box.w / (maxX - minX || 1), ky = box.h / (maxY - minY || 1);
  const k = Math.min(kx, ky);
  const sx = stretch ? kx : k, sy = stretch ? ky : k;
  const ox = box.x + (box.w - (maxX - minX) * sx) / 2, oy = box.y + (box.h - (maxY - minY) * sy) / 2;
  return pts.map(([x, y]) => [ox + (x - minX) * sx, oy + (y - minY) * sy]);
}

/** Equirectangular [x, y] of {lat, lon} points, y pointing down (screen space). */
export const toPlane = (points) => {
  const k = Math.cos(points[0].lat * RAD);
  return points.map((p) => [p.lon * k, -p.lat]);
};

/** Web Mercator tile { x, y } holding a {lat, lon} point at zoom z. */
export function tileOf({ lat, lon }, z) {
  const n = 2 ** z, s = Math.sin(lat * RAD);
  const clamp = (v) => Math.min(n - 1, Math.max(0, Math.floor(v)));
  return { x: clamp(((lon + 180) / 360) * n), y: clamp((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n) };
}

/**
 * Tiles { z, x, y } covering a corridor of `buffer` meters around a {lat, lon} line, for every
 * zoom from minZoom to maxZoom. Long segments are sampled so no tile along them is skipped.
 */
export function tilesAlong(points, { minZoom, maxZoom, buffer }) {
  const seen = new Map();
  const cover = (p) => {
    const dLat = buffer / 111320, dLon = dLat / Math.cos(p.lat * RAD);
    for (let z = minZoom; z <= maxZoom; z++) {
      const a = tileOf({ lat: p.lat + dLat, lon: p.lon - dLon }, z), b = tileOf({ lat: p.lat - dLat, lon: p.lon + dLon }, z);
      for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) seen.set(`${z}/${x}/${y}`, { z, x, y });
    }
  };
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const steps = prev ? Math.ceil(haversine(prev, p) / buffer) : 1;
    for (let k = 1; k <= steps; k++) cover(prev ? { lat: prev.lat + ((p.lat - prev.lat) * k) / steps, lon: prev.lon + ((p.lon - prev.lon) * k) / steps } : p);
  });
  return [...seen.values()];
}
