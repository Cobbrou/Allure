// Grade Adjusted Pace: the flat-ground pace that would cost the same energy.
// Energy cost of running per grade from Minetti et al. (2002), J/kg/m, valid on ±45 %.

const cost = (g) => 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;

/**
 * Effort factor of a grade (rise / run) relative to flat: 1 on flat, > 1 uphill.
 * ponytail: downhill savings are halved, since runners cannot use all the energy Minetti
 * measured on a treadmill; an HR-calibrated model (as Strava did) would be the upgrade.
 */
export function gradeFactor(g) {
  const f = cost(Math.max(-0.45, Math.min(0.45, g))) / cost(0);
  return f < 1 ? 1 - (1 - f) / 2 : f;
}

const WINDOW = 10; // m on each side used to measure the grade (smoothed ele is still noisy over 2 m)

/**
 * Cumulative flat-equivalent distance for an analyzed track ({ dist, ele }).
 * Returns null without elevation.
 */
export function adjustedDistance(track) {
  if (track.length < 2 || track.some((p) => p.ele == null)) return null;
  const out = [0];
  let lo = 0, hi = 0;
  for (let i = 1; i < track.length; i++) {
    const mid = (track[i - 1].dist + track[i].dist) / 2;
    while (track[lo + 1].dist < mid - WINDOW && lo + 1 < i) lo++;
    while (hi < track.length - 1 && track[hi].dist < mid + WINDOW) hi++;
    const run = track[hi].dist - track[lo].dist;
    const g = run > 0 ? (track[hi].ele - track[lo].ele) / run : 0;
    out.push(out[i - 1] + (track[i].dist - track[i - 1].dist) * gradeFactor(g));
  }
  return out;
}
