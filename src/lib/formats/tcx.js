/** Parse Garmin TCX text into { type, points }. Browser only (DOMParser). */
export function parseTcx(text) {
  // Strava's TCX exports start with whitespace before <?xml, which is a parse error.
  const doc = new DOMParser().parseFromString(text.trim(), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Fichier TCX invalide (XML illisible).');
  const v = (n, tag) => n.getElementsByTagNameNS('*', tag)[0]?.textContent;
  const points = [...doc.getElementsByTagNameNS('*', 'Trackpoint')]
    .map((n) => {
      const ele = v(n, 'AltitudeMeters'), time = v(n, 'Time');
      const hr = n.getElementsByTagNameNS('*', 'HeartRateBpm')[0];
      return {
        lat: parseFloat(v(n, 'LatitudeDegrees')),
        lon: parseFloat(v(n, 'LongitudeDegrees')),
        ele: ele != null ? parseFloat(ele) : null,
        time: time ? Date.parse(time) : null,
        hr: hr ? parseFloat(v(hr, 'Value')) : null,
      };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (points.length < 2) throw new Error('Aucun point GPS exploitable dans ce fichier.');
  return { type: doc.getElementsByTagNameNS('*', 'Activity')[0]?.getAttribute('Sport'), points };
}
