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
