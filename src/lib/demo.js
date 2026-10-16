import { RAD } from './geo.js';

/** ~10 km loop around Chamonix, with slope-driven pace and lagging heart rate. */
export function demoTrack() {
  const c = { lat: 45.9237, lon: 6.8694 };
  const N = 1200;
  const xy = [];
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * 2 * Math.PI;
    const r = 1 + 0.18 * Math.sin(3 * th) + 0.07 * Math.cos(5 * th + 1) + 0.01 * Math.sin(40 * th);
    xy.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  let len = 0;
  for (let i = 1; i <= N; i++) len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  const scale = 10000 / len;
  const mLat = 1 / 111320;
  const mLon = 1 / (111320 * Math.cos(c.lat * RAD));

  const eles = xy.map((_, i) => {
    const th = (i / N) * 2 * Math.PI;
    return 1040 + 85 * (1 - Math.cos(th)) + 14 * Math.sin(7 * th) + (Math.random() - 0.5);
  });

  let t = Date.parse('2026-10-12T07:30:00Z');
  let hr = 118;
  return xy.map(([x, y], i) => {
    if (i > 0) {
      const d = scale * Math.hypot(x - xy[i - 1][0], y - xy[i - 1][1]);
      const slope = (eles[i] - eles[i - 1]) / d;
      const speed = Math.min(4.6, Math.max(1.6, 3.35 * Math.exp(-4 * slope))) * (0.97 + Math.random() * 0.06);
      t += (d / speed) * 1000;
      const target = 142 + 260 * slope + 18 * (i / N);
      hr += (target - hr) * 0.04 + (Math.random() - 0.5) * 1.5;
    }
    return {
      lat: c.lat + y * scale * mLat,
      lon: c.lon + x * scale * mLon,
      ele: Math.round(eles[i] * 10) / 10,
      time: Math.round(t),
      hr: Math.round(hr),
    };
  });
}
