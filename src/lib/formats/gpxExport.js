const GPX_TYPES = { run: 'running', ride: 'cycling', hike: 'hiking', walk: 'walking', swim: 'swimming' };

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const iso = (ms) => new Date(ms).toISOString();

/** Serialize an activity to GPX 1.1 with Garmin TrackPointExtension heart rate. */
export function toGpx(meta, points) {
  const pts = points.map((p) => {
    let inner = '';
    if (p.ele != null) inner += `<ele>${p.ele}</ele>`;
    if (p.time != null) inner += `<time>${iso(p.time)}</time>`;
    if (p.hr != null) inner += `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`;
    return `<trkpt lat="${p.lat}" lon="${p.lon}">${inner}</trkpt>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Allure" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><name>${esc(meta.name)}</name><time>${iso(meta.date)}</time></metadata>
<trk><name>${esc(meta.name)}</name><type>${GPX_TYPES[meta.sport] ?? 'running'}</type><trkseg>
${pts.join('\n')}
</trkseg></trk>
</gpx>
`;
}
