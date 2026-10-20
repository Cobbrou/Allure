import { t } from './i18n.js';
import { analyze } from './analyze.js';
import { powerStats } from './power.js';
import { bestEfforts } from './records.js';
import { hrTime } from './training.js';
import { SPORTS } from './sports.js';

/**
 * Build a storable activity from raw points.
 * `meta` is the lightweight record used by lists. `points` is stored separately and only
 * loaded on the detail screen.
 */
export function createActivity({ name, sport = 'run', points, source = 'gpx', laps }) {
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
    bestEfforts: bestEfforts(a.track),
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
  const { meta: fresh } = createActivity({ sport: meta.sport, points: kept, source: meta.source, laps: inside.length ? [start, ...inside] : null });
  const typed = Object.fromEntries(['name', 'gear', 'description', 'notes', 'rpe'].filter((k) => meta[k] !== undefined).map((k) => [k, meta[k]]));
  return { meta: { ...fresh, ...typed, id: meta.id }, points: kept };
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

/** Same start second and distance within 10 m: treated as the same activity on re-import. */
export const dupKey = (meta) => `${Math.round(meta.date / 1000)}|${Math.round(meta.distance / 10)}`;

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
