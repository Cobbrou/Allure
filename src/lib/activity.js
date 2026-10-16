import { analyze } from './analyze.js';
import { SPORTS } from './sports.js';

/**
 * Build a storable activity from raw points.
 * `meta` is the lightweight record used by lists. `points` is stored separately and only
 * loaded on the detail screen.
 */
export function createActivity({ name, sport = 'run', points, source = 'gpx' }) {
  const a = analyze(points);
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
  };
  return { meta, points };
}

/** "Course du matin", "Vélo du soir"… */
export function defaultName(sport, date) {
  const h = new Date(date).getHours();
  const period = h < 12 ? 'du matin' : h < 18 ? "de l'après-midi" : 'du soir';
  return `${SPORTS[sport]?.label ?? 'Activité'} ${period}`;
}

/** ~n [lon, lat] pairs for feed thumbnails. */
export function preview(points, n = 80) {
  const step = Math.max(1, Math.ceil(points.length / n));
  const r = (v) => Math.round(v * 1e5) / 1e5;
  return points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p) => [r(p.lon), r(p.lat)]);
}
