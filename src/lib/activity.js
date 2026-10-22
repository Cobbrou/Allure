import { t } from './i18n.js';
import { analyze } from './analyze.js';
import { powerStats } from './power.js';
import { bestEfforts, effortDistances } from './records.js';
import { hrTime } from './training.js';
import { dropSpikes, SPORTS } from './sports.js';

/**
 * Build a storable activity from raw points.
 * `meta` is the lightweight record used by lists. `points` is stored separately and only
 * loaded on the detail screen. GPS spikes are dropped from the points.
 */
export function createActivity({ name, sport = 'run', points, source = 'gpx', laps }) {
  points = dropSpikes(points, sport);
  const a = analyze(points, sport);
  const date = a.date ?? Date.now();
  const meta = {
    id: crypto.randomUUID(),
    name: name || defaultName(sport, date),
    sport,
    source,
    date,
    distance: a.distance,
    movingTime: a.movingTime,
    avgPace: a.avgPace,
    gain: a.gain,
    avgHr: a.avgHr,
    preview: preview(points),
    bestEfforts: bestEfforts(a.track, effortDistances(sport)),
    hrTime: hrTime(points),
    ...powerStats(points), // avgPower, np, powerCurve: rides with a power meter
  };
  // Device laps (start times, ms); a single lap is the whole activity.
  if (laps?.length > 1) meta.laps = laps;
  return { meta, points };
}

/**
 * The activity cut to points from..to (inclusive): every stat recomputed, what the athlete
 * typed kept, device laps inside the new range kept. Segment efforts are redone on save.
 */
export function cropActivity(meta, points, from, to) {
  const kept = points.slice(from, to + 1);
  const start = kept[0].time, end = kept.at(-1).time;
  const inside = (meta.laps ?? []).filter((t) => t > start && t < end);
  const { meta: fresh, points: clean } = createActivity({ sport: meta.sport, points: kept, source: meta.source, laps: inside.length ? [start, ...inside] : null });
  const typed = Object.fromEntries(['name', 'gear', 'description', 'notes', 'rpe', 'noRecords'].filter((k) => meta[k] !== undefined).map((k) => [k, meta[k]]));
  return { meta: { ...fresh, ...typed, id: meta.id }, points: clean };
}

/**
 * The meta with every stat recomputed from its points by today's code (e.g. a meta restored
 * from an older backup); id, name, date, typed fields and laps kept. Track-less activities
 * come back unchanged.
 */
export function refreshStats(meta, points) {
  if (points.length < 2) return meta;
  const { id, name, date, source, ...stats } = createActivity({ sport: meta.sport, points, source: meta.source }).meta;
  return { ...meta, ...stats };
}

/**
 * The points with each one's heart rate from the nearest sample of hrs [{ time, bpm }] (sorted
 * by time) within `within` ms, else null. Points must be sorted by time.
 */
export function withHr(points, hrs, within) {
  let j = 0;
  return points.map((p) => {
    while (j + 1 < hrs.length && Math.abs(hrs[j + 1].time - p.time) <= Math.abs(hrs[j].time - p.time)) j++;
    return { ...p, hr: hrs[j] && Math.abs(hrs[j].time - p.time) <= within ? hrs[j].bpm : null };
  });
}

const WATCH_HR_WITHIN = 60000; // ms: a watch outside an exercise samples heart rate sparsely
const WATCH_HR_DAYS = 3; // a watch's heart rate can reach Health Connect hours after the run

/** A phone recording without heart rate, recent enough for the watch's to still be coming. */
export const needsWatchHr = (meta, now) =>
  meta.source === 'record' && !meta.avgHr && meta.preview?.length > 1 && now - meta.date < WATCH_HR_DAYS * 86400e3;

/**
 * The activity with a watch's heart rate samples [{ time, bpm }] (sorted) on its points, stats
 * recomputed and typed fields kept; null when no sample falls on the track.
 */
export function addWatchHr(meta, points, hrs) {
  const merged = withHr(points, hrs, WATCH_HR_WITHIN);
  return merged.some((p) => p.hr != null) ? cropActivity(meta, merged, 0, merged.length - 1) : null;
}

/**
 * An activity typed in by hand (gym, treadmill, pool, a forgotten watch): no points, the
 * summary is what the athlete entered. distance and gain are optional (0 / null).
 */
export function manualActivity({ id, name, sport = 'run', date, movingTime, distance = 0, gain = null, rpe }) {
  const meta = {
    id: id ?? crypto.randomUUID(),
    name: name || defaultName(sport, date),
    sport,
    source: 'manual',
    date,
    distance,
    movingTime,
    avgPace: distance ? movingTime / (distance / 1000) : null,
    gain,
    avgHr: null,
    preview: [],
    bestEfforts: {},
    hrTime: {},
  };
  if (rpe) meta.rpe = rpe;
  return { meta, points: [] };
}

const MAX_GAP = 60; // s: a longer gap between samples is a pause

/**
 * An activity without a GPS track (treadmill, home trainer, pool) from a file's or a watch's
 * samples [{ time, hr?, dist?, power? }]: like one typed in by hand, plus heart rate and power.
 * distance and movingTime come from the device when given, else from the samples.
 */
export function indoorActivity({ name, sport = 'run', samples, distance, movingTime, source = 'gpx' }) {
  let moving = 0, far = 0, hrSum = 0, hrN = 0;
  samples.forEach((s, i) => {
    const dt = i ? (s.time - samples[i - 1].time) / 1000 : 0;
    if (dt > 0 && dt < MAX_GAP) moving += dt;
    if (s.dist > far) far = s.dist;
    if (Number.isFinite(s.hr)) { hrSum += s.hr; hrN++; }
  });
  const { meta } = manualActivity({ name, sport, date: samples[0].time, movingTime: Math.round(movingTime ?? moving), distance: distance ?? far });
  return { meta: { ...meta, source, avgHr: hrN ? Math.round(hrSum / hrN) : null, hrTime: hrTime(samples), ...powerStats(samples) }, points: [] };
}

/**
 * Same sport and overlapping time ranges: the same session, e.g. from Health Connect and from
 * the watch's FIT file. The range ends after the moving time (the elapsed time is not stored).
 */
export const isDuplicate = (a, b) =>
  a.sport === b.sport && a.date <= b.date + (b.movingTime ?? 0) * 1000 && b.date <= a.date + (a.movingTime ?? 0) * 1000;

/** "Course du matin", "Vélo du soir"… */
export function defaultName(sport, date) {
  const h = new Date(date).getHours();
  const label = SPORTS[sport]?.label ?? t('Activité');
  return t(h < 12 ? '{sport} du matin' : h < 18 ? "{sport} de l'après-midi" : '{sport} du soir', { sport: label });
}

/** ~n [lon, lat] pairs for feed thumbnails. */
export function preview(points, n = 80) {
  const step = Math.max(1, Math.ceil(points.length / n));
  const r = (v) => Math.round(v * 1e5) / 1e5;
  return points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p) => [r(p.lon), r(p.lat)]);
}
