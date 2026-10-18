import { adjustedDistance } from './gap.js';
import { haversine } from './geo.js';
import { SPORTS } from './sports.js';

// 7-point moving average: GPS altitude is noisy, raw deltas would inflate D+.
function smoothEle(points) {
  const first = points.find((p) => p.ele != null);
  if (!first) return null;
  let last = first.ele;
  const raw = points.map((p) => (last = p.ele ?? last));
  return raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 3), i + 4);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
}

// Moving = faster than the sport's threshold and no recording gap (auto-pause) over 60 s.
const moving = (sport) => {
  const min = (SPORTS[sport] ?? SPORTS.run).moving;
  return (d, dt) => dt > 0 && dt < 60 && d / dt > min;
};

/** Compute activity stats and an enriched track (cumulative dist, smoothed ele, grade-adjusted gdist). */
export function analyze(points, sport) {
  const isMoving = moving(sport);
  const hasTime = points.every((p) => Number.isFinite(p.time));
  const ele = smoothEle(points);
  let dist = 0, movingTime = 0, gain = 0;

  const track = points.map((p, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      const d = haversine(prev, p);
      dist += d;
      if (hasTime && isMoving(d, (p.time - prev.time) / 1000)) movingTime += (p.time - prev.time) / 1000;
      if (ele && ele[i] > ele[i - 1]) gain += ele[i] - ele[i - 1];
    }
    return { ...p, ele: ele ? ele[i] : null, dist };
  });

  const gdist = adjustedDistance(track);
  if (gdist) track.forEach((p, i) => { p.gdist = gdist[i]; });
  const hrs = points.map((p) => p.hr).filter(Number.isFinite);
  return {
    track,
    distance: dist,
    movingTime: hasTime ? movingTime : null,
    avgPace: hasTime && dist ? movingTime / (dist / 1000) : null,
    gap: hasTime && gdist?.at(-1) ? movingTime / (gdist.at(-1) / 1000) : null, // grade adjusted pace, s/km
    gain: ele ? gain : null,
    avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
    date: hasTime ? points[0].time : null,
  };
}

/**
 * Splits of `size` meters over an analyzed track. Each segment counts toward the split
 * where it starts. The last split is partial, and dropped if under 2% of `size`.
 */
export function computeSplits(track, size = 1000, sport) {
  const hasTime = track.every((p) => Number.isFinite(p.time));
  const isMoving = moving(sport);
  const splits = [];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    const s = (splits[Math.floor(a.dist / size)] ??= { dist: 0, gdist: 0, time: 0, gain: 0, loss: 0 });
    const d = b.dist - a.dist;
    s.dist += d;
    s.gdist += (b.gdist ?? b.dist) - (a.gdist ?? a.dist);
    if (hasTime && isMoving(d, (b.time - a.time) / 1000)) s.time += (b.time - a.time) / 1000;
    if (a.ele != null && b.ele != null) {
      const de = b.ele - a.ele;
      if (de > 0) s.gain += de; else s.loss -= de;
    }
  }
  const clean = splits.filter(Boolean);
  if (clean.length > 1 && clean.at(-1).dist < size * 0.02) clean.pop();
  return clean.map((s) => ({
    ...s,
    pace: hasTime && s.time ? s.time / (s.dist / 1000) : null,
    gap: hasTime && s.time && track[0].gdist != null ? s.time / (s.gdist / 1000) : null,
  }));
}
