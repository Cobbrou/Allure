export const RECORD_DISTANCES = [
  { id: '1k', label: '1 km', m: 1000 },
  { id: '5k', label: '5 km', m: 5000 },
  { id: '10k', label: '10 km', m: 10000 },
  { id: 'half', label: 'Semi-marathon', m: 21097.5 },
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
