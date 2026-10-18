import { getLang, t, tn } from './i18n.js';
import { progress } from './follow.js';
import { haversine } from './geo.js';
import { segmentStep } from './liveSegments.js';
import { distLen, fmtSpeed, isImperial, shortLen } from './format.js';
import { SPORTS, splitSize } from './sports.js';

// Live recording as a pure state machine: every function takes a recording and returns
// a new one (or the same object when nothing changed). Times are ms epoch.
//
// The clock counts only running time: `active` holds the time banked before the last
// pause, `runningSince` is when the clock last started (null while paused).

const MAX_ACCURACY = 30; // m: fixes less precise than this are dropped
const MIN_STEP = 3; // m: smaller moves are GPS jitter, not progress
const STOP_SPEED = { ride: 1.5 }; // m/s under which the athlete counts as stopped (default 0.6)
const STOP_DELAY = 5000; // ms of being stopped before auto-pause kicks in
const PACE_WINDOW = 30000; // ms of track used for the current pace

/** route: optional route to follow, from followRoute(). liveSegs: from liveSegments(). safety: check-ins on. */
export function startRecording({ sport = 'run', autoPause = true, audio = true, safety = false, route = null, liveSegs = [] }, now) {
  return { sport, autoPause, audio, safety, route, follow: null, liveSegs, seg: null, laps: [], start: now, points: [], distance: 0, active: 0, runningSince: now, paused: false, autoPaused: false, lastMove: now, pos: null };
}

/** Running time in seconds. */
export const elapsed = (rec, now) => (rec.active + (rec.runningSince != null ? now - rec.runningSince : 0)) / 1000;

const stopClock = (rec, at) =>
  rec.runningSince == null ? rec : { ...rec, active: rec.active + Math.max(0, at - rec.runningSince), runningSince: null };

export const pause = (rec, now) => (rec.paused ? rec : { ...stopClock(rec, now), paused: true });

export const resume = (rec, now) =>
  rec.paused ? { ...rec, paused: false, autoPaused: false, runningSince: now, lastMove: now } : rec;

/** Start a new lap now (manual lap button). laps: [{ time, at }], at = running seconds then. */
export const lap = (rec, now) => (rec.paused ? rec : { ...rec, laps: [...(rec.laps ?? []), { time: now, at: elapsed(rec, now) }] });

/** Current lap number (from 1) and its running seconds so far. */
export function lapStatus(rec, now) {
  const laps = rec.laps ?? [];
  return { n: laps.length + 1, time: elapsed(rec, now) - (laps.at(-1)?.at ?? 0) };
}

/** Spoken summary of a finished lap. */
export function lapCue(n, seconds) {
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const hours = h ? `${tn(h, '{n} heure', '{n} heures')} ` : '';
  return t('Tour {n} : {time}.', { n, time: `${hours}${tn(m, '{n} minute', '{n} minutes')} ${s % 60}` });
}

/** Lap start times (ms) for the saved activity: the start, then each lap press. Null without laps. */
export const lapStarts = (rec) => (rec.laps?.length ? [rec.points[0]?.time ?? rec.start, ...rec.laps.map((l) => l.time)] : null);

/** After a crash or reload: paused, with the clock stopped at the last saved point. */
export const recover = (rec) => ({ ...stopClock(rec, rec.points.at(-1)?.time ?? rec.start), paused: true, autoPaused: false });

// The autosaved draft is split so a save writes only what changed: `current` holds the small
// live state, `static` the route and segments (set at start), `p0`, `p1`… the points in chunks.
const CHUNK = 500;

/**
 * [key, value] writes that bring a saved draft up to `rec`. saved: { route, liveSegs, count }
 * as last written (null for a fresh store); returns it updated as `saved`.
 */
export function draftWrites(rec, saved) {
  const { points, route, liveSegs, ...state } = rec;
  const writes = [];
  if (saved?.route !== route || saved?.liveSegs !== liveSegs) writes.push(['static', { route, liveSegs }]);
  // Rewrite from the chunk holding the first unsaved point (all of them if the track shrank).
  const from = saved && saved.count <= points.length ? Math.floor(saved.count / CHUNK) : 0;
  for (let i = from; i * CHUNK < points.length; i++) writes.push([`p${i}`, points.slice(i * CHUNK, (i + 1) * CHUNK)]);
  writes.push(['current', { ...state, count: points.length }]);
  return { writes, saved: { route, liveSegs, count: points.length } };
}

/** The recording back from the stored draft entries (a Map of key to value), or null. */
export function joinDraft(entries) {
  const cur = entries.get('current');
  if (!cur) return null;
  if (cur.points) return cur; // draft saved whole, before it was split
  const { count, ...state } = cur;
  const points = [];
  // A chunk is missing only if a save was cut short: keep the points before it.
  for (let i = 0, c; points.length < count && (c = entries.get(`p${i}`)); i++) points.push(...c.slice(0, count - points.length));
  return { ...state, ...entries.get('static'), points };
}

/** Feed one GPS fix: { lat, lon, ele?, time, accuracy?, speed? }. */
export function addFix(rec, fix) {
  if ((fix.accuracy ?? 0) > MAX_ACCURACY) return rec;
  if (rec.paused) return { ...rec, pos: fix };
  if (rec.route) rec = { ...rec, follow: progress(rec.route, fix, rec.follow) };
  if (rec.liveSegs?.length) rec = { ...rec, seg: segmentStep(rec.seg, rec.liveSegs, fix) };
  const prev = rec.points.at(-1);
  const d = prev ? haversine(prev, fix) : 0;
  if (prev && d < MIN_STEP) return tick({ ...rec, pos: fix }, fix.time);

  // Speed against the previous fix, not the last stored point, which can be minutes old after a stop.
  const last = rec.pos ?? prev;
  const dt = last ? (fix.time - last.time) / 1000 : 0;
  const speed = fix.speed ?? (dt > 0 ? haversine(last, fix) / dt : 0);
  const moving = !prev || speed >= (STOP_SPEED[rec.sport] ?? 0.6);
  let next = { ...rec, pos: fix, points: [...rec.points, point(fix)], distance: rec.distance + d };
  if (moving) {
    next.lastMove = fix.time;
    // Moving again after an auto-pause: the clock restarts now.
    if (next.autoPaused) next = { ...next, autoPaused: false, runningSince: fix.time };
  }
  return tick(next, fix.time);
}

/** Auto-pause once stopped for STOP_DELAY. Also called on a timer, as fixes can stop coming in. */
export function tick(rec, now) {
  if (!rec.autoPause || rec.paused || rec.autoPaused || now - rec.lastMove < STOP_DELAY) return rec;
  return { ...stopClock(rec, rec.lastMove), autoPaused: true };
}

const point = ({ lat, lon, ele, time, hr }) => ({ lat, lon, ele: ele ?? null, time, ...(hr != null && { hr }) });

/** Seconds per km over the last PACE_WINDOW, null when stopped or not enough track. */
export function currentPace(rec) {
  if (rec.paused || rec.autoPaused) return null;
  const pts = rec.points, last = pts.at(-1);
  if (!last) return null;
  let i = pts.length - 1, d = 0;
  for (; i > 0 && last.time - pts[i - 1].time <= PACE_WINDOW; i--) d += haversine(pts[i - 1], pts[i]);
  const dt = (last.time - pts[i].time) / 1000;
  return d > 10 && dt > 0 ? dt / (d / 1000) : null;
}

/** Spoken summary when `next` crosses a split boundary (sport split size), else null. */
export function splitCue(prev, next, now) {
  const sport = SPORTS[next.sport] ?? SPORTS.run;
  const size = splitSize(next.sport);
  const n = Math.floor(next.distance / size);
  if (n <= Math.floor(prev.distance / size)) return null;
  const sPerKm = elapsed(next, now) / (next.distance / 1000);
  const count = n * sport.split;
  const dist = sport.display === 'pace100'
    ? t(isImperial() ? '{n} yards' : '{n} mètres', { n: count })
    : isImperial() ? tn(count, '{n} mile', '{n} miles') : tn(count, '{n} kilomètre', '{n} kilomètres');
  if (sport.display === 'speed') {
    const speed = getLang() === 'fr' ? fmtSpeed(sPerKm).replace('.', ',') : fmtSpeed(sPerKm);
    return t(isImperial() ? '{dist}. Vitesse moyenne {speed} miles heure.' : '{dist}. Vitesse moyenne {speed} kilomètres heure.', { dist, speed });
  }
  const s = Math.round(sport.display === 'pace100' ? (sPerKm / 10) * shortLen() : (sPerKm * distLen()) / 1000);
  return t('{dist}. Allure moyenne {m} minutes {s}.', { dist, m: Math.floor(s / 60), s: s % 60 });
}
