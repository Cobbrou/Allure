import { DEMO_ROUTES } from './demoRoutes.js';
import { haversine } from './geo.js';

// Each place has a real foot loop and bike loop (see scripts/demo-routes.mjs).
export const PLACES = [
  { name: 'Chamonix', ele: 1040, relief: 85 },
  { name: 'Annecy', ele: 450, relief: 15 }, // lakeside, nearly flat
  { name: 'Paris', ele: 35, relief: 12 },
];

// speed: flat-ground m/s, k: slope sensitivity, hr: steady-state bpm, km: demo distance range.
const PROFILES = {
  run: { speed: 3.35, k: 4, hr: 142, km: [5, 14], relief: 1 },
  ride: { speed: 7.8, k: 9, hr: 132, km: [25, 60], relief: 1.5 },
  hike: { speed: 1.25, k: 5, hr: 118, km: [8, 16], relief: 3 },
};

// Interval session: [seconds, speed factor]. 12 min warm-up, 8 × (3 min fast, 90 s jog), then cool-down.
const WORKOUT = [[720, 0.95], ...Array.from({ length: 8 }, () => [[180, 1.3], [90, 0.7]]).flat()];
const COOLDOWN = 0.9;
// Lap start offsets (s) a watch would record with auto-lap on each block.
const WORKOUT_LAPS = WORKOUT.reduce((acc, [secs]) => [...acc, acc.at(-1) + secs], [0]);

/** Speed factor at `s` seconds into the workout. */
function workoutFactor(s) {
  for (const [secs, f] of WORKOUT) if ((s -= secs) < 0) return f;
  return COOLDOWN;
}

/**
 * `km` along the place's real loop (laps repeat, random start and direction), with
 * synthetic slope-driven speed and lagging heart rate. Defaults: 10 km run in Chamonix.
 * `workout`: speed follows the WORKOUT interval blocks.
 */
export function demoTrack({ place = PLACES[0], sport = 'run', km = 10, start = Date.parse('2026-10-12T07:30:00Z'), rand = Math.random, workout = false } = {}) {
  const prof = PROFILES[sport];
  const loop = DEMO_ROUTES[place.name][sport === 'ride' ? 'bike' : 'foot'].map(([lon, lat]) => ({ lat, lon }));
  if (rand() < 0.5) loop.reverse();
  const cum = loop.map(() => 0);
  for (let i = 1; i < loop.length; i++) cum[i] = cum[i - 1] + haversine(loop[i - 1], loop[i]);
  const L = cum.at(-1);

  // Distances along the track: a sample every ~8 m plus every loop vertex (so corners
  // aren't cut), starting at a random offset and wrapping around the loop.
  const total = km * 1000;
  const offset = rand() * L;
  const N = Math.round(km * 120);
  const marks = Array.from({ length: N + 1 }, (_, i) => (i * total) / N);
  for (let lap = 0; lap * L < offset + total; lap++) {
    for (const c of cum) if (lap * L + c - offset > 0 && lap * L + c - offset < total) marks.push(lap * L + c - offset);
  }
  marks.sort((a, b) => a - b);
  const dist = marks.filter((m, i) => i === 0 || m - marks[i - 1] > 0.5);

  const xy = dist.map((abs) => {
    const s = (offset + abs) % L;
    const seg = Math.max(0, cum.findIndex((c) => c > s) - 1);
    const f = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const a = loop[seg], b = loop[seg + 1];
    return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, th: (abs / total) * 2 * Math.PI };
  });

  const relief = place.relief * prof.relief;
  const base = xy.map(({ th }) => place.ele + relief * (1 - Math.cos(th)) + (relief / 6) * Math.sin(7 * th));

  let t = start;
  let hr = prof.hr - 25;
  return xy.map(({ lat, lon }, i) => {
    if (i > 0) {
      const d = dist[i] - dist[i - 1];
      const slope = (base[i] - base[i - 1]) / d; // noise-free: vertex gaps can be under 1 m
      const f = workout ? workoutFactor((t - start) / 1000) : 1;
      const v = Math.min(1.4 * prof.speed, Math.max(0.45 * prof.speed, f * prof.speed * Math.exp(-prof.k * slope)));
      t += (d / (v * (0.97 + rand() * 0.06))) * 1000;
      const target = Math.min(prof.hr + 45, prof.hr + 260 * slope + 18 * (i / dist.length) + (f - 1) * 120);
      hr += (target - hr) * 0.04 + (rand() - 0.5) * 1.5;
    }
    return {
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      ele: Math.round((base[i] + rand() - 0.5) * 10) / 10,
      time: Math.round(t),
      hr: Math.round(hr),
    };
  });
}
/** `count` varied activities spread over the last 60 days, newest first. The second is an interval session. */
export function demoHistory(now = Date.now(), count = 20, rand = Math.random) {
  return Array.from({ length: count }, (_, i) => {
    if (i === 1) {
      const place = PLACES[1 + Math.floor(rand() * 2)]; // flat places: the intervals show in the pace
      const start = now - (3 + rand()) * 86400e3;
      return { sport: 'run', name: `Fractionné à ${place.name}`, laps: WORKOUT_LAPS.map((s) => start + s * 1000),
        points: demoTrack({ place, sport: 'run', km: 11, start, rand, workout: true }) };
    }
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
