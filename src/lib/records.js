
import { t } from './i18n.js';
export const RECORD_DISTANCES = [
  { id: '1k', label: '1 km', m: 1000 },
  { id: '5k', label: '5 km', m: 5000 },
  { id: '10k', label: '10 km', m: 10000 },
  { id: 'half', get label() { return t('Semi-marathon'); }, m: 21097.5 },
  { id: 'marathon', label: 'Marathon', m: 42195 },
];

/**
 * Fastest elapsed time (s) over each record distance, by a two-pointer sliding window over
 * the analyzed track (cumulative `dist`). The window time is scaled to the exact distance.
 * Returns e.g. { '1k': 262, '5k': 1390 }; distances longer than the activity are absent.
 */
export function bestEfforts(track) {
  if (track.length < 2 || !track.every((p) => Number.isFinite(p.time))) return {};
  const out = {};
  for (const { id, m } of RECORD_DISTANCES) {
    if (track.at(-1).dist < m) break;
    let best = Infinity;
    for (let i = 0, j = 1; j < track.length; j++) {
      while (i + 1 < j && track[j].dist - track[i + 1].dist >= m) i++;
      const d = track[j].dist - track[i].dist;
      if (d >= m) best = Math.min(best, ((track[j].time - track[i].time) / 1000) * (m / d));
    }
    if (best < Infinity) out[id] = Math.round(best);
  }
  return out;
}

/** Best time per record distance across run activities: [{ ...distance, time, activity }]. */
export function personalRecords(metas) {
  return RECORD_DISTANCES.map((r) => {
    let best = null;
    for (const a of metas) {
      const t = a.sport === 'run' ? a.bestEfforts?.[r.id] : undefined;
      if (t && (!best || t < best.time)) best = { time: t, activity: a };
    }
    return { ...r, ...best };
  });
}

const RIEGEL = 1.06; // fatigue exponent: time grows slightly faster than distance
const MIN_SOURCE = 1 / 4; // a source must cover this share of the target: Riegel is too optimistic from short efforts

/**
 * Race time predictions per record distance from runs in the last `days` days, with the
 * Riegel formula T2 = T1 * (D2 / D1)^1.06. Sources are each run's best efforts and the
 * run itself; the fastest prediction wins. [{ ...distance, time?, from?: { m, time, activity } }].
 */
export function predictRaces(metas, now = Date.now(), days = 90) {
  const sources = [];
  for (const a of metas) {
    if (a.sport !== 'run' || a.date < now - days * 86400e3) continue;
    for (const r of RECORD_DISTANCES) if (a.bestEfforts?.[r.id]) sources.push({ m: r.m, time: a.bestEfforts[r.id], activity: a });
    if (a.movingTime && a.distance > 1000) sources.push({ m: a.distance, time: a.movingTime, activity: a });
  }
  return RECORD_DISTANCES.map((r) => {
    let best = null;
    for (const s of sources) {
      if (s.m < r.m * MIN_SOURCE) continue;
      const time = Math.round(s.time * (r.m / s.m) ** RIEGEL);
      if (!best || time < best.time) best = { time, from: s };
    }
    return { ...r, ...best };
  });
}
