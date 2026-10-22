// Running paces from one fitness number, Jack Daniels' VDOT (Daniels & Gilbert, "Oxygen
// Power", 1979). A race time gives the VDOT, the VDOT gives every race time and training
// pace. Paces are s/km, ranges are [fast, slow].

import { t } from './i18n.js';
import { RECORD_DISTANCES } from './records.js';
import { SPORTS } from './sports.js';

/** Oxygen cost (ml/kg/min) of running at v m/min. */
const vo2Cost = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/** Speed (m/min) whose oxygen cost is vo2: the positive root of vo2Cost. */
const speedFor = (vo2) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (vo2 + 4.6))) / (2 * 0.000104);
/** Share of VO2max sustainable for `min` minutes. */
const sustainable = (min) => 0.8 + 0.1894393 * Math.exp(-0.012778 * min) + 0.2989558 * Math.exp(-0.1932605 * min);
const paceOf = (vMin) => 60000 / vMin; // m/min to s/km

/** VDOT of a race: `distance` m in `time` s. */
export function vdot(distance, time) {
  const min = time / 60;
  return vo2Cost(distance / min) / sustainable(min);
}

/** Race time (s) over `distance` m for a VDOT, by bisection (vdot falls as time grows). */
export function raceTime(v, distance) {
  let lo = distance / 1000 * 60, hi = distance / 1000 * 1200; // 1:00 to 20:00 per km
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distance, mid) > v) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

const SPREAD = 5; // s/km either side of a single target pace

/**
 * Training paces for a VDOT: easy (65-74 % of VDOT), marathon (race pace from raceTime),
 * threshold (88 %), interval (97.5 %), repetition (interval minus 6 s per 400 m).
 */
export function trainingPaces(v) {
  const at = (share) => paceOf(speedFor(v * share));
  const around = (p) => [Math.round(p - SPREAD), Math.round(p + SPREAD)];
  const interval = at(0.975);
  return {
    easy: [Math.round(at(0.74)), Math.round(at(0.65))],
    marathon: around(raceTime(v, 42195) / 42.195),
    threshold: around(at(0.88)),
    interval: around(interval),
    repetition: around(interval - 15),
  };
}

const MIN_EFFORT = 3000; // shorter efforts overrate endurance; used only when there is nothing longer

/**
 * Current fitness from the last `days` of runs (best efforts and whole runs): the highest
 * VDOT, from efforts of 3 km or more when any. { vdot, distance, time, activity } or null.
 */
export function currentVdot(metas, now = Date.now(), days = 90) {
  const sources = [];
  for (const a of metas) {
    if (a.sport !== 'run' || a.noRecords || a.date > now || a.date < now - days * 86400e3) continue;
    for (const r of RECORD_DISTANCES) if (a.bestEfforts?.[r.id]) sources.push({ distance: r.m, time: a.bestEfforts[r.id], activity: a });
    if (a.movingTime && a.distance > 1000) sources.push({ distance: a.distance, time: a.movingTime, activity: a });
  }
  const long = sources.filter((s) => s.distance >= MIN_EFFORT);
  let best = null;
  for (const s of long.length ? long : sources) {
    const v = vdot(s.distance, s.time);
    if (!best || v > best.vdot) best = { ...s, vdot: Math.round(v * 10) / 10 };
  }
  return best;
}

/** Pace zones, slowest first. Each zone starts at `from(paces)` s/km (Infinity: no bound). */
export const PACE_ZONES = [
  { get label() { return t('Z1 Facile'); }, from: () => Infinity },
  { get label() { return t('Z2 Marathon'); }, from: (p) => p.easy[0] },
  { get label() { return t('Z3 Seuil'); }, from: (p) => (p.marathon[0] + p.threshold[1]) / 2 },
  { get label() { return t('Z4 VO2max'); }, from: (p) => (p.threshold[0] + p.interval[1]) / 2 },
  { get label() { return t('Z5 Vitesse'); }, from: (p) => (p.interval[0] + p.repetition[1]) / 2 },
];

const CHUNK = 10; // s: GPS pace point to point is too noisy, so pace is taken over ~10 s

/** Moving seconds in each PACE_ZONES zone over an analyzed track (`dist`, `time`). */
export function timeInPaceZones(track, paces) {
  const bounds = PACE_ZONES.map((z) => z.from(paces));
  const out = PACE_ZONES.map(() => 0);
  const min = SPORTS.run.moving;
  let start = 0;
  for (let i = 1; i < track.length; i++) {
    const dt = (track[i].time - track[i - 1].time) / 1000;
    if (!(dt > 0 && dt < 60)) { start = i; continue; } // pause: restart the chunk
    const span = (track[i].time - track[start].time) / 1000;
    if (span < CHUNK && i < track.length - 1) continue;
    const d = track[i].dist - track[start].dist;
    if (d / span > min) {
      const pace = span / (d / 1000);
      let z = bounds.length - 1;
      while (z > 0 && pace > bounds[z]) z--;
      out[z] += span;
    }
    start = i;
  }
  return out.map(Math.round);
}

// Heat: slowdown by temperature + dew point in °F, the runners' rule of thumb (Hadley's table:
// under 100 nothing, 180 and over hard running is not advised). Upper end of each band.
const HEAT = [[100, 0], [110, 0.005], [120, 0.01], [130, 0.02], [140, 0.03], [150, 0.045], [160, 0.06], [170, 0.08], [180, 0.1]];
const toF = (c) => c * 1.8 + 32;

/**
 * Pace slowdown (share, 0..0.1) for an air temperature and dew point (°C), interpolated
 * in the table; `hot`: too hot for hard efforts (sum ≥ 180 °F).
 */
export function heatSlowdown(temp, dew) {
  const sum = toF(temp) + toF(dew);
  const i = HEAT.findIndex(([f]) => f >= sum);
  if (i === 0) return { factor: 0, hot: false };
  if (i < 0) return { factor: HEAT.at(-1)[1], hot: true };
  const [[f0, a], [f1, b]] = [HEAT[i - 1], HEAT[i]];
  return { factor: Math.round((a + ((b - a) * (sum - f0)) / (f1 - f0)) * 1000) / 1000, hot: false };
}
