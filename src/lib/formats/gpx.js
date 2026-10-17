/** Parse GPX text into { name, type, points: [{ lat, lon, ele, time, hr, power? }] }. Browser only (DOMParser). */
export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Fichier GPX invalide (XML illisible).');
  let nodes = [...doc.getElementsByTagNameNS('*', 'trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagNameNS('*', 'rtept')];
  const points = nodes
    .map((n) => {
      const v = (tag) => n.getElementsByTagNameNS('*', tag)[0]?.textContent;
      const ele = v('ele'), time = v('time'), hr = v('hr'), power = v('power'); // <power>: Strava's GPX extension
      return {
        lat: parseFloat(n.getAttribute('lat')),
        lon: parseFloat(n.getAttribute('lon')),
        ele: ele != null ? parseFloat(ele) : null,
        time: time ? Date.parse(time) : null,
        hr: hr != null ? parseFloat(hr) : null,
        ...(power != null && { power: parseFloat(power) }),
      };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (points.length < 2) throw new Error('Aucun point GPS exploitable dans ce fichier.');
  const name = doc.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim();
  const type = doc.getElementsByTagNameNS('*', 'type')[0]?.textContent?.trim();
  return { name, type, points };
}
