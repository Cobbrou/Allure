// Workout analysis: a track cut into intervals, from the device's laps or auto-detected
// from changes of pace (fast efforts vs recoveries).

const HALF_WINDOW = 15; // s on each side to smooth speed: GPS pace is noisy second to second
const MIN_RUN = 20; // s: shorter bursts or pauses are folded into their neighbours
const CONTRAST = 1.3; // fast speeds must be this much above slow ones to call it a workout
const SHARE = 0.1; // and each pace must fill this share of moving samples, not just a few transitions

/** Stats of track[from..to]: elapsed time, pace (s/km), grade adjusted pace, average HR. */
export function intervalStats(track, from, to, work = null) {
  const a = track[from], b = track[to];
  const dist = b.dist - a.dist;
  const time = (b.time - a.time) / 1000;
  const hrs = track.slice(from, to + 1).map((p) => p.hr).filter(Number.isFinite);
  const gdist = a.gdist != null ? b.gdist - a.gdist : null;
  return {
    from, to, work, dist, time,
    pace: dist > 0 ? time / (dist / 1000) : null,
    gap: gdist > 0 ? time / (gdist / 1000) : null,
    hr: hrs.length ? hrs.reduce((s, v) => s + v, 0) / hrs.length : null,
  };
}

/** Two-means split of 1-D values: { lo, hi } cluster centers. */
function twoMeans(values) {
  const s = [...values].sort((x, y) => x - y);
  let lo = s[Math.floor(s.length * 0.2)], hi = s[Math.floor(s.length * 0.8)];
  for (let it = 0; it < 20; it++) {
    const mid = (lo + hi) / 2;
    const l = s.filter((v) => v < mid), h = s.filter((v) => v >= mid);
    if (!l.length || !h.length) break;
    lo = l.reduce((x, y) => x + y, 0) / l.length;
    hi = h.reduce((x, y) => x + y, 0) / h.length;
  }
  return { lo, hi };
}

/** Intervals between the device's lap start times (ms). Work = faster half when paces clearly differ. */
export function lapIntervals(track, laps) {
  if (!(laps?.length > 1) || !track.every((p) => Number.isFinite(p.time))) return [];
  // Lap starts within 5 s of either end are clock jitter between the lap and record messages.
  const t0 = track[0].time, t1 = track.at(-1).time;
  const cuts = laps.filter((t) => t > t0 + 5000 && t < t1 - 5000).map((t) => track.findIndex((p) => p.time >= t));
  const bounds = [0, ...new Set(cuts), track.length - 1];
  if (bounds.length < 3) return [];
  const out = bounds.slice(1).map((to, k) => intervalStats(track, bounds[k], to));
  const speeds = out.map((l) => (l.time ? l.dist / l.time : 0));
  const { lo, hi } = twoMeans(speeds);
  if (hi >= lo * CONTRAST) out.forEach((l, k) => { l.work = speeds[k] >= (lo + hi) / 2; });
  return out;
}

/**
 * Auto-detected work and recovery intervals, or [] for a steady effort. Speed is smoothed
 * over ±15 s and grade adjusted when `gdist` exists, so hills don't read as intervals.
 * Stops (under half the median moving speed: traffic lights, photos) keep the current
 * label, so a city run with stops is not a workout.
 * ponytail: needs 2+ fast bouts, and standing recoveries read as stops; a single tempo
 * block or rest-on-the-spot reps are not detected. Add rules if athletes ask for them.
 */
export function detectIntervals(track) {
  const n = track.length;
  if (n < 3 || !track.every((p) => Number.isFinite(p.time))) return [];
  const D = (i) => track[i].gdist ?? track[i].dist;
  const t = (i) => track[i].time / 1000;
  const speed = new Array(n);
  for (let i = 0, lo = 0, hi = 0; i < n; i++) {
    while (t(lo) < t(i) - HALF_WINDOW) lo++;
    while (hi < n - 1 && t(hi + 1) <= t(i) + HALF_WINDOW) hi++;
    speed[i] = t(hi) > t(lo) ? (D(hi) - D(lo)) / (t(hi) - t(lo)) : 0;
  }
  const sorted = speed.filter((v) => v > 0.5).sort((x, y) => x - y);
  if (sorted.length < 10) return [];
  const floor = sorted[sorted.length >> 1] / 2;
  const kept = sorted.filter((v) => v >= floor);
  const { lo, hi } = twoMeans(kept);
  if (hi < lo * CONTRAST) return [];
  const mid = (lo + hi) / 2;
  const slowShare = kept.filter((v) => v < mid).length / kept.length;
  if (slowShare < SHARE || slowShare > 1 - SHARE) return [];

  // Runs of consecutive fast / slow points; neighbours share their boundary point.
  let runs = [];
  for (let i = 1; i < n; i++) {
    const last = runs.at(-1);
    const fast = speed[i] < floor && last ? last.fast : speed[i] >= mid;
    if (last?.fast === fast) last.to = i;
    else runs.push({ fast, from: last ? last.to : 0, to: i });
  }
  // Fold short runs into the previous one (or the next, at the start), shortest first.
  for (;;) {
    const dur = (r) => t(r.to) - t(r.from);
    const short = runs.filter((r) => dur(r) < MIN_RUN && runs.length > 1).sort((x, y) => dur(x) - dur(y))[0];
    if (!short) break;
    short.fast = runs[runs.indexOf(short) - 1]?.fast ?? runs[1].fast;
    runs = runs.reduce((out, r) => {
      const last = out.at(-1);
      if (last?.fast === r.fast) last.to = r.to;
      else out.push({ ...r });
      return out;
    }, []);
  }
  if (runs.filter((r) => r.fast).length < 2) return [];
  return runs.map((r) => intervalStats(track, r.from, r.to, r.fast));
}
