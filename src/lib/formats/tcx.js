
import { t } from '../i18n.js';
/**
 * Parse Garmin TCX text into { type, points, laps }. laps: start times, ms. Browser only (DOMParser).
 * Without GPS (treadmill, home trainer): { type, samples, laps }, samples being { time, hr, dist, power? }.
 */
export function parseTcx(text) {
  // Strava's TCX exports start with whitespace before <?xml, which is a parse error.
  const doc = new DOMParser().parseFromString(text.trim(), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Fichier TCX invalide (XML illisible).');
  const v = (n, tag) => n.getElementsByTagNameNS('*', tag)[0]?.textContent;
  const all = [...doc.getElementsByTagNameNS('*', 'Trackpoint')]
    .map((n) => {
      const ele = v(n, 'AltitudeMeters'), time = v(n, 'Time'), dist = v(n, 'DistanceMeters');
      const hr = n.getElementsByTagNameNS('*', 'HeartRateBpm')[0];
      const watts = v(n, 'Watts'); // TPX extension
      return {
        lat: parseFloat(v(n, 'LatitudeDegrees')),
        lon: parseFloat(v(n, 'LongitudeDegrees')),
        ele: ele != null ? parseFloat(ele) : null,
        time: time ? Date.parse(time) : null,
        hr: hr ? parseFloat(v(hr, 'Value')) : null,
        dist: dist != null ? parseFloat(dist) : null,
        ...(watts != null && { power: parseFloat(watts) }),
      };
    });
  const laps = [...doc.getElementsByTagNameNS('*', 'Lap')].map((n) => Date.parse(n.getAttribute('StartTime'))).filter(Number.isFinite);
  const type = doc.getElementsByTagNameNS('*', 'Activity')[0]?.getAttribute('Sport');
  const gps = all.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(({ dist, ...p }) => p);
  if (gps.length >= 2) return { type, points: gps, laps };
  const samples = all.filter((p) => Number.isFinite(p.time)).map(({ lat, lon, ele, ...s }) => s);
  if (samples.length < 2) throw new Error(t('Aucune donnée exploitable dans ce fichier.'));
  return { type, samples, laps };
}
