// Heart-rate training metrics. Each activity stores `hrTime`, a histogram of moving
// seconds per bpm, so zones and load can be recomputed for any max / resting HR without
// loading tracks.

import { t } from './i18n.js';

export const DEFAULT_REST_HR = 60;
export const DEFAULT_MAX_HR = 190;

/** Lower bound of each zone, as a fraction of max HR. */
export const ZONES = [
  { get label() { return t('Z1 Récupération'); }, from: 0 },
  { get label() { return t('Z2 Endurance'); }, from: 0.6 },
  { get label() { return t('Z3 Tempo'); }, from: 0.7 },
  { get label() { return t('Z4 Seuil'); }, from: 0.8 },
  { get label() { return t('Z5 Anaérobie'); }, from: 0.9 },
];

/** { bpm: seconds } over a track. Gaps of 60 s or more (pauses) are skipped. */
export function hrTime(points) {
  const out = {};
  for (let i = 1; i < points.length; i++) {
    const { hr, time } = points[i];
    const dt = (time - points[i - 1].time) / 1000;
    if (!Number.isFinite(hr) || !(dt > 0 && dt < 60)) continue;
    out[Math.round(hr)] = (out[Math.round(hr)] ?? 0) + dt;
  }
  for (const k in out) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

/**
 * Max HR estimate from history: the highest bpm held for at least 60 s in one activity
 * (strap glitches rarely last that long).
 * Falls back to DEFAULT_MAX_HR when no activity has heart rate.
 */
export function estimateMaxHr(activities) {
  let max = 0;
  for (const a of activities) {
    let held = 0;
    for (const bpm of Object.keys(a.hrTime ?? {}).map(Number).sort((x, y) => y - x)) {
      held += a.hrTime[bpm];
      if (held >= 60) { max = Math.max(max, bpm); break; }
    }
  }
  return max || DEFAULT_MAX_HR;
}

/** Seconds spent in each of the 5 zones. */
export function timeInZones(hist, maxHr) {
  const out = ZONES.map(() => 0);
  for (const [bpm, s] of Object.entries(hist ?? {})) {
    let z = ZONES.length - 1;
    while (z > 0 && bpm < ZONES[z].from * maxHr) z--;
    out[z] += s;
  }
  return out;
}

/**
 * Relative Effort: Banister TRIMP, minutes weighted by heart-rate reserve with an
 * exponential factor, so hard minutes count much more than easy ones. Comparable across
 * sports. About 100 for an hour at a steady endurance effort. null without heart rate.
 */
export function relativeEffort(hist, { max, rest }) {
  let trimp = 0, any = false;
  for (const [bpm, s] of Object.entries(hist ?? {})) {
    const hrr = Math.min(1, Math.max(0, (bpm - rest) / (max - rest)));
    trimp += (s / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
    any = true;
  }
  return any ? Math.round(trimp) : null;
}

const DAY = 86400e3;
const dayStart = (t) => new Date(t).setHours(0, 0, 0, 0);

/**
 * Fitness & Freshness over the last `days` days, ending today: fitness = 42-day
 * exponentially weighted load (CTL), fatigue = 7-day (ATL), form = fitness - fatigue (TSB).
 * Daily load is the summed Relative Effort. Computed from the first activity on, so the
 * averages are warmed up when the window starts.
 */
export function fitnessSeries(activities, hr, days = 90, now = Date.now()) {
  const load = new Map();
  for (const a of activities) {
    const d = dayStart(a.date);
    load.set(d, (load.get(d) ?? 0) + (relativeEffort(a.hrTime, hr) ?? 0));
  }
  const today = dayStart(now);
  const first = Math.min(dayStart(today - (days - 1) * DAY + DAY / 2), ...load.keys());
  const out = [];
  let ctl = 0, atl = 0;
  // Step by calendar day, not 24 h, so DST changes don't shift the keys.
  for (let d = new Date(first); d.getTime() <= today; d.setDate(d.getDate() + 1)) {
    const l = load.get(d.getTime()) ?? 0;
    ctl += (l - ctl) / 42;
    atl += (l - atl) / 7;
    out.push({ date: d.getTime(), load: l, fitness: ctl, fatigue: atl, form: ctl - atl });
  }
  return out.slice(-days);
}
