// Segments: a stretch of road or trail cut from an activity. Every activity of the same
// sport that rides it gets a segment effort, timed from start to end (elapsed time).

import { haversine } from './geo.js';
import { thin } from './heatmap.js';

const TOL = 30; // m a track may sit off the segment line, start and end included
const DETOUR = 1.5; // max track length between start and end, relative to the segment

/** A segment from points `from`..`to` of an analyzed track (cumulative `dist`, smoothed `ele`). */
export function createSegment({ name, sport, track, from, to }) {
  const part = track.slice(from, to + 1);
  let gain = 0;
  for (let i = 1; i < part.length; i++) if (part[i].ele > part[i - 1].ele) gain += part[i].ele - part[i - 1].ele;
  const distance = track[to].dist - track[from].dist;
  const climb = part[0].ele != null ? part.at(-1).ele - part[0].ele : null;
  return {
    id: crypto.randomUUID(),
    name,
    sport,
    points: thin(part, 10), // [lon, lat]
    distance,
    gain: part[0].ele != null ? gain : null,
    grade: climb != null && distance ? (climb / distance) * 100 : null, // average, %
    created: Date.now(),
  };
}

/**
 * Every pass of `points` (raw timestamped fixes) over `segment`, as { seg, time, from, to }
 * with point indices. A pass starts near the segment start, reaches each segment point in
 * order, and ends near its end without a detour longer than DETOUR × its length.
 * ponytail: point-to-point checks; fixes sparser than ~2×TOL apart (smart recording) can miss.
 */
export function findEfforts(segment, points) {
  if (!(segment.points?.length > 1) || !points.every((p) => Number.isFinite(p.time))) return [];
  const seg = segment.points.map(([lon, lat]) => ({ lon, lat }));
  const start = seg[0], end = seg.at(-1);
  const maxLen = segment.distance * DETOUR + 2 * TOL;
  // Reaching this segment point is real progress; before it, the track may still turn back.
  const k0 = Math.max(1, seg.findIndex((p) => haversine(p, start) > 2 * TOL));
  const efforts = [];
  let i = 0;
  while (i < points.length) {
    if (haversine(points[i], start) > TOL) { i++; continue; }
    // The closest fix of this pass through the start zone.
    let s = i;
    for (; i < points.length && haversine(points[i], start) <= TOL; i++) if (haversine(points[i], start) < haversine(points[s], start)) s = i;
    const pass = follow(s);
    if (!pass) continue;
    efforts.push({ seg: segment.id, time: (points[pass.to].time - points[pass.from].time) / 1000, ...pass });
    i = pass.to + 1;
  }
  return efforts;

  // { from, to } fix indices, or null if the track leaves the segment first.
  function follow(from) {
    let k = 1, len = 0;
    for (let j = from + 1; j < points.length; j++) {
      len += haversine(points[j - 1], points[j]);
      if (len > maxLen) return null;
      // Back through the start before any real progress (a spur, a U-turn): start over there.
      const d = haversine(points[j], start);
      if (k < k0 && d <= TOL && (haversine(points[j - 1], start) > TOL || d < haversine(points[from], start))) {
        from = j; k = 1; len = 0;
      }
      while (k < seg.length && haversine(points[j], seg[k]) <= TOL) k++;
      if (k < seg.length) continue;
      let to = j;
      for (; j < points.length && haversine(points[j], end) <= TOL; j++) if (haversine(points[j], end) < haversine(points[to], end)) to = j;
      return { from, to };
    }
    return null;
  }
}

/** Efforts on `segments` found in `points`, for an activity of `sport`. */
export const segmentEfforts = (segments, sport, points) =>
  segments.filter((s) => s.sport === sport).flatMap((s) => findEfforts(s, points));

/** All efforts on `segment` among `metas`, fastest first, each with its activity meta. */
export function leaderboard(segment, metas) {
  return metas
    .filter((m) => m.sport === segment.sport)
    .flatMap((m) => (m.efforts ?? []).filter((e) => e.seg === segment.id).map((e) => ({ ...e, meta: m })))
    .sort((a, b) => a.time - b.time);
}
