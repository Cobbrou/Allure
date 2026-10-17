// Cycling power: power curve (best average watts per duration), Normalized Power,
// FTP estimate, Intensity Factor and Training Stress Score.

/** Durations (s) of the power curve. */
export const CURVE = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const MAX_GAP = 10; // s: a longer gap between samples is a pause, not held power

/**
 * One watt value per second of riding, holding each sample until the next one. Pauses
 * (gaps over MAX_GAP) are dropped, not counted as zero. Null when the track has no power.
 */
export function powerSeries(points) {
  const pts = points.filter((p) => Number.isFinite(p.power) && Number.isFinite(p.time));
  if (pts.length < 2) return null;
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = Math.round((pts[i].time - pts[i - 1].time) / 1000);
    if (dt > MAX_GAP) continue;
    for (let s = 0; s < dt; s++) out.push(pts[i - 1].power);
  }
  return out.length ? out : null;
}

/** { [duration]: best average watts } for every CURVE duration the series is long enough for. */
export function powerCurve(series) {
  const sum = [0];
  for (const w of series) sum.push(sum.at(-1) + w);
  const curve = {};
  for (const d of CURVE) {
    if (d > series.length) break;
    let best = 0;
    for (let i = d; i < sum.length; i++) best = Math.max(best, sum[i] - sum[i - d]);
    curve[d] = Math.round(best / d);
  }
  return curve;
}

/** Normalized Power: fourth-root mean of the fourth power of the 30 s rolling average. */
export function normalizedPower(series) {
  if (series.length < 30) return null;
  let rolling = 0, acc = 0;
  for (let i = 0; i < series.length; i++) {
    rolling += series[i] - (i >= 30 ? series[i - 30] : 0);
    if (i >= 29) acc += (rolling / 30) ** 4;
  }
  return Math.round((acc / (series.length - 29)) ** 0.25);
}

/** Power fields for an activity meta, or {} when the track has no power. */
export function powerStats(points) {
  const series = powerSeries(points);
  if (!series) return {};
  return {
    avgPower: Math.round(series.reduce((a, b) => a + b, 0) / series.length),
    np: normalizedPower(series),
    powerCurve: powerCurve(series),
  };
}

/** Best of each duration across activities' meta.powerCurve. */
export function bestCurve(metas) {
  const best = {};
  for (const m of metas) for (const [d, w] of Object.entries(m.powerCurve ?? {})) best[d] = Math.max(best[d] ?? 0, w);
  return best;
}

const FTP_WINDOW = 90 * 86400e3; // ms of history used for the FTP estimate

/** FTP estimate: 95 % of the best 20 min power over the last 90 days, or null. */
export function estimateFtp(metas, now = Date.now()) {
  const w = bestCurve(metas.filter((m) => m.date > now - FTP_WINDOW))[1200];
  return w ? Math.round(w * 0.95) : null;
}

/** Intensity Factor and Training Stress Score of a ride, given its NP, duration (s) and FTP. */
export function trainingStress(np, seconds, ftp) {
  if (!np || !ftp || !seconds) return null;
  const intensity = np / ftp;
  return { intensity, tss: Math.round(((seconds * np * intensity) / (ftp * 3600)) * 100) };
}
