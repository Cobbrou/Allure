import { haversine } from './geo.js';

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

/** Compute activity stats, per-km splits and an enriched track (cumulative dist, smoothed ele). */
export function analyze(points) {
  const hasTime = points.every((p) => Number.isFinite(p.time));
  const ele = smoothEle(points);
  let dist = 0, moving = 0, gain = 0;
  const splits = [];

  const track = points.map((p, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      const d = haversine(prev, p);
      const s = (splits[Math.floor(dist / 1000)] ??= { dist: 0, time: 0, gain: 0, loss: 0 });
      dist += d;
      s.dist += d;
      if (hasTime) {
        const dt = (p.time - prev.time) / 1000;
        // Moving = speed > 0.5 m/s and no recording gap (auto-pause) over 60 s.
        if (dt > 0 && dt < 60 && d / dt > 0.5) {
          moving += dt;
          s.time += dt;
        }
      }
      if (ele) {
        const de = ele[i] - ele[i - 1];
        if (de > 0) { gain += de; s.gain += de; } else s.loss -= de;
      }
    }
    return { ...p, ele: ele ? ele[i] : null, dist };
  });

  const cleanSplits = splits.filter(Boolean);
  if (cleanSplits.length > 1 && cleanSplits.at(-1).dist < 20) cleanSplits.pop();
  const hrs = points.map((p) => p.hr).filter(Number.isFinite);

  return {
    track,
    distance: dist,
    movingTime: hasTime ? moving : null,
    avgPace: hasTime && dist ? moving / (dist / 1000) : null,
    gain: ele ? gain : null,
    avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
    date: hasTime ? points[0].time : null,
    splits: cleanSplits.map((s) => ({ ...s, pace: hasTime && s.time ? s.time / (s.dist / 1000) : null })),
  };
}
