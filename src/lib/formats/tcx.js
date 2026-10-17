
import { t } from '../i18n.js';
/** Parse Garmin TCX text into { type, points, laps }. laps: start times, ms. Browser only (DOMParser). */
export function parseTcx(text) {
  // Strava's TCX exports start with whitespace before <?xml, which is a parse error.
  const doc = new DOMParser().parseFromString(text.trim(), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Fichier TCX invalide (XML illisible).');
  const v = (n, tag) => n.getElementsByTagNameNS('*', tag)[0]?.textContent;
  const points = [...doc.getElementsByTagNameNS('*', 'Trackpoint')]
    .map((n) => {
      const ele = v(n, 'AltitudeMeters'), time = v(n, 'Time');
      const hr = n.getElementsByTagNameNS('*', 'HeartRateBpm')[0];
      const watts = v(n, 'Watts'); // TPX extension
      return {
        lat: parseFloat(v(n, 'LatitudeDegrees')),
        lon: parseFloat(v(n, 'LongitudeDegrees')),
        ele: ele != null ? parseFloat(ele) : null,
        time: time ? Date.parse(time) : null,
        hr: hr ? parseFloat(v(hr, 'Value')) : null,
        ...(watts != null && { power: parseFloat(watts) }),
      };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (points.length < 2) throw new Error(t('Aucun point GPS exploitable dans ce fichier.'));
  const laps = [...doc.getElementsByTagNameNS('*', 'Lap')].map((n) => Date.parse(n.getAttribute('StartTime'))).filter(Number.isFinite);
  return { type: doc.getElementsByTagNameNS('*', 'Activity')[0]?.getAttribute('Sport'), points, laps };
}
