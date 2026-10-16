import { RAD } from './geo.js';

export const PLACES = [
  { name: 'Chamonix', lat: 45.9237, lon: 6.8694, ele: 1040, relief: 85 },
  { name: 'Annecy', lat: 45.8992, lon: 6.1294, ele: 450, relief: 60 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522, ele: 35, relief: 12 },
];

// speed: flat-ground m/s, k: slope sensitivity, hr: steady-state bpm, km: demo distance range.
const PROFILES = {
  run: { speed: 3.35, k: 4, hr: 142, km: [5, 14], relief: 1 },
  ride: { speed: 7.8, k: 9, hr: 132, km: [25, 60], relief: 1.5 },
  hike: { speed: 1.25, k: 5, hr: 118, km: [8, 16], relief: 3 },
};

/** Synthetic loop with slope-driven speed and lagging heart rate. Defaults: 10 km run in Chamonix. */
export function demoTrack({ place = PLACES[0], sport = 'run', km = 10, start = Date.parse('2026-10-12T07:30:00Z'), rand = Math.random } = {}) {
  const prof = PROFILES[sport];
  const N = Math.round(km * 120);
  const [a3, a5, rot] = [0.1 + 0.15 * rand(), 0.03 + 0.08 * rand(), rand() * 2 * Math.PI];
  const xy = [];
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * 2 * Math.PI;
    const r = 1 + a3 * Math.sin(3 * th) + a5 * Math.cos(5 * th + 1) + 0.01 * Math.sin(40 * th);
    xy.push([Math.cos(th + rot) * r, Math.sin(th + rot) * r]);
  }
  let len = 0;
  for (let i = 1; i <= N; i++) len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  const scale = (km * 1000) / len;
  const mLat = 1 / 111320;
  const mLon = 1 / (111320 * Math.cos(place.lat * RAD));

  const relief = place.relief * prof.relief;
  const eles = xy.map((_, i) => {
    const th = (i / N) * 2 * Math.PI;
    return place.ele + relief * (1 - Math.cos(th)) + (relief / 6) * Math.sin(7 * th) + (rand() - 0.5);
  });

  let t = start;
  let hr = prof.hr - 25;
  return xy.map(([x, y], i) => {
    if (i > 0) {
      const d = scale * Math.hypot(x - xy[i - 1][0], y - xy[i - 1][1]);
      const slope = (eles[i] - eles[i - 1]) / d;
      const v = Math.min(1.4 * prof.speed, Math.max(0.45 * prof.speed, prof.speed * Math.exp(-prof.k * slope)));
      t += (d / (v * (0.97 + rand() * 0.06))) * 1000;
      const target = prof.hr + 260 * slope + 18 * (i / N);
      hr += (target - hr) * 0.04 + (rand() - 0.5) * 1.5;
    }
    return {
      lat: place.lat + y * scale * mLat,
      lon: place.lon + x * scale * mLon,
      ele: Math.round(eles[i] * 10) / 10,
      time: Math.round(t),
      hr: Math.round(hr),
    };
  });
}

/** `count` varied activities spread over the last 60 days, newest first. */
export function demoHistory(now = Date.now(), count = 20, rand = Math.random) {
  return Array.from({ length: count }, (_, i) => {
    const sport = rand() < 0.6 ? 'run' : rand() < 0.6 ? 'ride' : 'hike';
    const place = PLACES[Math.floor(rand() * PLACES.length)];
    const [min, max] = PROFILES[sport].km;
    const km = Math.round((min + rand() * (max - min)) * 10) / 10;
    const day = new Date(now - ((i * 60) / count + rand()) * 86400e3);
    day.setHours(7 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);
    if (day.getTime() > now) day.setTime(now - 3 * 3600e3);
    return { sport, name: `${{ run: 'Course', ride: 'Vélo', hike: 'Randonnée' }[sport]} à ${place.name}`,
      points: demoTrack({ place, sport, km, start: day.getTime(), rand }) };
  });
}
