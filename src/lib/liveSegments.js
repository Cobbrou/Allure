// Live segments: while recording, notice when the athlete starts one of their segments,
// follow them along it, and time the effort against their record at the finish.

import { followRoute, progress } from './follow.js';
import { haversine } from './geo.js';
import { leaderboard } from './segments.js';

const START = 25; // m from a segment's start within which crossing it begins an attempt
const END = 3; // m: a segment is done once past its end, not 30 m before like a route

/** Light copies of the sport's segments for a recording: line to follow and record time. */
export function liveSegments(segments, sport, metas) {
  return segments.filter((s) => s.sport === sport && s.points?.length > 1).map((s) => ({
    id: s.id,
    name: s.name,
    line: { ...followRoute(s, s.points.map(([lon, lat]) => ({ lon, lat }))), end: END },
    pr: leaderboard(s, metas)[0]?.time ?? null,
  }));
}

/**
 * Next live-segment state after a fix. state: { active: { id, start, follow } | null,
 * last: { id, time, pr, at } | null } where `last` is the latest finished effort (at: ms).
 * Leaving the segment line abandons the attempt.
 */
export function segmentStep(state, segs, fix) {
  const active = state?.active;
  if (active) {
    const seg = segs.find((s) => s.id === active.id);
    const follow = progress(seg.line, fix, active.follow);
    if (follow.off) return { ...state, active: null };
    if (follow.done) return { active: null, last: { id: seg.id, time: (fix.time - active.start) / 1000, pr: seg.pr, at: fix.time } };
    return { ...state, active: { ...active, follow } };
  }
  // Started once past the start line: near it, and projecting onto the segment beyond its first point.
  // ponytail: timed from that first fix, so sparse fixes shave a little; interpolate the crossing if it matters.
  for (const seg of segs) {
    if (haversine(fix, { lon: seg.line.coords[0][0], lat: seg.line.coords[0][1] }) > START) continue;
    const follow = progress(seg.line, fix, null);
    if (!follow.off && follow.along > 0) return { last: state?.last ?? null, active: { id: seg.id, start: fix.time, follow } };
  }
  return state ?? { active: null, last: null };
}

/** Spoken message when a segment starts or finishes between two recordings, else null. */
export function segmentCue(prev, next) {
  const a = prev?.seg, b = next?.seg;
  if (!b || !next.liveSegs) return null;
  const name = (id) => next.liveSegs.find((s) => s.id === id)?.name;
  if (b.active && b.active.id !== a?.active?.id) {
    const pr = next.liveSegs.find((s) => s.id === b.active.id)?.pr;
    return `Segment ${name(b.active.id)}.${pr ? ` Record : ${speakTime(pr)}.` : ''}`;
  }
  if (b.last && b.last !== a?.last) {
    const { time, pr } = b.last;
    return `Segment terminé en ${speakTime(time)}.${pr == null ? '' : time < pr ? ' Nouveau record !' : ` ${speakTime(time - pr)} de plus que ton record.`}`;
  }
  return null;
}

const speakTime = (s) => {
  s = Math.round(s);
  const m = Math.floor(s / 60);
  return m ? `${m} minute${m > 1 ? 's' : ''} ${s % 60}` : `${s} secondes`;
};
