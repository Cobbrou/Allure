import { getLang, t, tn } from './i18n.js';
import { followStep } from './follow.js';
import { haversine } from './geo.js';
import { segmentStep } from './liveSegments.js';
import { distLen, fmtSpeed, isImperial, shortLen } from './format.js';
import { displayOf, effort, isSpike, SPORTS, splitSize } from './sports.js';

// Live recording as a pure state machine: every function takes a recording and returns
// a new one (or the same object when nothing changed). Times are ms epoch.
//
// The clock counts only running time: `active` holds the time banked before the last
// pause, `runningSince` is when the clock last started (null while paused).

export const MAX_ACCURACY = 30; // m: fixes less precise than this are dropped
const MAX_SPIKES = 5; // fixes in a row skipped as GPS spikes
const MIN_STEP = 3; // m: smaller moves are GPS jitter, not progress
// m/s under which the athlete counts as stopped; other sports use their `moving` threshold.
const STOP_SPEED = { run: 0.6, ride: 1.5 };
const STOP_DELAY = 5000; // ms of being stopped before auto-pause kicks in
const RESUME_RADIUS = 15; // m from the stop point before an auto-pause ends: standing-still GPS jitter wanders less
const PACE_WINDOW = 30000; // ms of track used for the current pace
const SENSOR_EVERY = 5000; // ms between sensor-only points while no fix is stored
const HR_ALERT_EVERY = 60000; // ms between two high heart rate alerts

/**
 * route: optional route to follow, from followRoute(). liveSegs: from liveSegments(). safety: check-ins on.
 * workout: optional structured workout, from startWorkout(). indoor: no GPS (treadmill, home
 * trainer, gym): the clock and the sensors only, `points` holding sensor samples without a position.
 */
export function startRecording({ sport = 'run', autoPause = true, audio = true, voice = VOICE, safety = false, route = null, liveSegs = [], workout = null, indoor = false }, now) {
  if (indoor) return { sport, indoor, autoPause: false, audio, voice, safety: false, route: null, workout, liveSegs: [], laps: [], start: now, points: [], distance: 0, active: 0, runningSince: now, paused: false, autoPaused: false, lastMove: now, pos: null };
  return { sport, autoPause, audio, voice, safety, route, workout, follow: null, followAlt: route && { f: null, r: null, f0: null, r0: null }, liveSegs, seg: null, laps: [], start: now, points: [], distance: 0, active: 0, runningSince: now, paused: false, autoPaused: false, lastMove: now, pos: null };
}

/** Running time in seconds. */
export const elapsed = (rec, now) => (rec.active + (rec.runningSince != null ? now - rec.runningSince : 0)) / 1000;

const stopClock = (rec, at) =>
  rec.runningSince == null ? rec : { ...rec, active: rec.active + Math.max(0, at - rec.runningSince), runningSince: null };

export const pause = (rec, now) => (rec.paused ? rec : { ...stopClock(rec, now), paused: true });

export const resume = (rec, now) =>
  rec.paused ? { ...rec, paused: false, autoPaused: false, runningSince: now, lastMove: now } : rec;

/** Start a new lap now (manual lap button). laps: [{ time, at, dist }], at = running seconds then, dist = meters. */
export const lap = (rec, now) => (rec.paused ? rec : { ...rec, laps: [...(rec.laps ?? []), { time: now, at: elapsed(rec, now), dist: rec.distance }] });

/** Current lap number (from 1) and its running seconds so far. */
export function lapStatus(rec, now) {
  const laps = rec.laps ?? [];
  return { n: laps.length + 1, time: elapsed(rec, now) - (laps.at(-1)?.at ?? 0) };
}

/** Seconds as spoken words: "1 heure 2 minutes 5". */
export function spokenTime(seconds) {
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const hours = h ? `${tn(h, '{n} heure', '{n} heures')} ` : '';
  return `${hours}${tn(m, '{n} minute', '{n} minutes')} ${s % 60}`;
}

/** Spoken summary of a finished lap. */
export const lapCue = (n, seconds) => t('Tour {n} : {time}.', { n, time: spokenTime(seconds) });

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
  // Too imprecise to record, but before the first point it still places the athlete on the map.
  if ((fix.accuracy ?? 0) > MAX_ACCURACY) return rec.points.length ? rec : { ...rec, pos: fix };
  if (rec.paused) return { ...rec, pos: fix };
  // A GPS spike (urban canyon, tunnel exit) is skipped; after MAX_SPIKES in a row, the jump is real.
  if (rec.points.length && isSpike(rec.points.at(-1), fix, rec.sport)) {
    if ((rec.spikes ?? 0) < MAX_SPIKES) return { ...rec, spikes: (rec.spikes ?? 0) + 1 };
  }
  if (rec.spikes) rec = { ...rec, spikes: 0 };
  if (rec.route) {
    const s = followStep(rec.route, rec.follow, rec.followAlt, fix);
    rec = { ...rec, route: s.route, follow: s.follow, followAlt: s.alt };
  }
  if (rec.liveSegs?.length) rec = { ...rec, seg: segmentStep(rec.seg, rec.liveSegs, fix) };
  const prev = rec.points.at(-1);
  const d = prev ? haversine(prev, fix) : 0;
  const stopSpeed = STOP_SPEED[rec.sport] ?? SPORTS[rec.sport]?.moving ?? 0.6;
  if (prev && d < MIN_STEP) {
    // Too close to store, but steady slow progress (a steep climb) is still moving.
    const creeping = d / ((fix.time - prev.time) / 1000) >= stopSpeed;
    return tick({ ...rec, pos: fix, ...(creeping && { lastMove: fix.time }) }, fix.time);
  }

  // Speed against the previous fix, not the last stored point, which can be minutes old after a stop.
  const last = rec.pos ?? prev;
  const dt = last ? (fix.time - last.time) / 1000 : 0;
  const speed = fix.speed ?? (dt > 0 ? haversine(last, fix) / dt : 0);
  const moving = !prev || (speed >= stopSpeed && !(rec.autoPaused && d < RESUME_RADIUS));
  // Stopped: nothing stored, so standing-still jitter adds no distance and the saved
  // activity agrees with the live clock. The next real move is measured from the stop point.
  // ponytail: jitter before auto-pause kicks in (STOP_DELAY) or with auto-pause off still counts.
  if (!moving) return tick({ ...rec, pos: fix }, fix.time);
  let next = { ...rec, pos: fix, points: [...rec.points, point(fix)], distance: rec.distance + d, lastMove: fix.time };
  // Moving again after an auto-pause: the clock restarts when the athlete left the stop point.
  if (next.autoPaused) next = { ...next, autoPaused: false, runningSince: Math.max(rec.lastMove, Math.round(fix.time - (d / speed) * 1000)) };
  return tick(next, fix.time);
}

/**
 * Keep the sensor readings while no point is stored (stopped, GPS jitter or lost): every
 * SENSOR_EVERY, a point at the last position with them. It adds no distance and, at zero
 * speed, no moving time. Called on the 1 s timer; data: fresh { hr?, cad?, power? }.
 * ponytail: in a tunnel the time stuck at the entrance reads as stopped, as auto-pause does.
 */
export function addReadings(rec, data, now) {
  const prev = rec.points.at(-1);
  if (rec.indoor) { // a sample without a position, every SENSOR_EVERY while there are readings
    if (!Object.keys(data).length || rec.paused || now - (prev?.time ?? 0) < SENSOR_EVERY) return rec;
    return { ...rec, points: [...rec.points, { time: now, ...data }] };
  }
  if (!Object.keys(data).length || rec.paused || !prev || now - prev.time < SENSOR_EVERY) return rec;
  return { ...rec, points: [...rec.points, point({ lat: prev.lat, lon: prev.lon, ele: prev.ele, time: now, ...data })] };
}

/** voice.hrHigh (bpm) crossed: `hrAlertAt` set to now, again every HR_ALERT_EVERY while above. */
export function hrAlert(rec, bpm, now) {
  const high = rec.voice?.hrHigh;
  if (!high || !(bpm > high) || rec.paused || now - (rec.hrAlertAt ?? 0) < HR_ALERT_EVERY) return rec;
  return { ...rec, hrAlertAt: now };
}

/** Auto-pause once stopped for STOP_DELAY. Also called on a timer, as fixes can stop coming in. */
export function tick(rec, now) {
  if (!rec.autoPause || rec.paused || rec.autoPaused || now - rec.lastMove < STOP_DELAY) return rec;
  return { ...stopClock(rec, rec.lastMove), autoPaused: true };
}

const point = ({ lat, lon, ele, time, hr, cad, power }) =>
  ({ lat, lon, ele: ele ?? null, time, ...(hr != null && { hr }), ...(cad != null && { cad }), ...(power != null && { power }) });

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

// Voice announcements: at each split (sport split size) or every `every` seconds of running
// time, the `fields` in order. The defaults speak the split distance and the average effort.
// hrHigh: bpm above which a heart rate alert is spoken and buzzed (null: off).
export const VOICE = { every: 'split', fields: ['distance', 'avg'], hrHigh: null };
export const VOICE_EVERY = ['split', 300, 600, 900]; // s
export const VOICE_FIELDS = ['time', 'distance', 'avg', 'pace', 'hr'];

const decimal = (s) => (getLang() === 'fr' ? s.replace('.', ',') : s);

/** Effort as spoken words: "{label} 5 minutes 30." or "{label} 12,0 kilomètres heure." sPerKm: s/km. */
function spokenEffort(sport, sPerKm, label) {
  if (!sPerKm || !Number.isFinite(sPerKm)) return null;
  if (displayOf(sport) === 'speed') {
    const speed = decimal(fmtSpeed(sPerKm));
    return `${label} ${t(isImperial() ? '{speed} miles heure' : '{speed} kilomètres heure', { speed })}.`;
  }
  const s = Math.round(displayOf(sport) === 'pace100' ? (sPerKm / 10) * shortLen() : (sPerKm * distLen()) / 1000);
  return `${label} ${t('{m} minutes {s}', { m: Math.floor(s / 60), s: s % 60 })}.`;
}

/** Meters as spoken words: whole splits ("5 kilomètres") or, between splits, two decimals. */
function spokenDistance(sport, meters) {
  if (SPORTS[sport]?.display === 'pace100') {
    return t(isImperial() ? '{n} yards' : '{n} mètres', { n: Math.round(meters / shortLen()) });
  }
  const d = meters / distLen(), n = Math.abs(d - Math.round(d)) < 1e-6 ? String(Math.round(d)) : decimal(d.toFixed(2));
  return isImperial() ? tn(d, '{n} mile', '{n} miles', { n }) : tn(d, '{n} kilomètre', '{n} kilomètres', { n });
}

/**
 * Voice announcement due between `prev` and `next`, or null: { text, cued }. Time cues set
 * `cued`, the count of intervals announced, for the caller to store in the recording.
 * bpm: fresh heart rate reading or null.
 */
export function voiceCue(prev, next, now, bpm = null) {
  const { every, fields } = { ...VOICE, ...next.voice };
  const time = elapsed(next, now);
  let meters = next.distance, cued;
  if (every === 'split') {
    const size = splitSize(next.sport);
    const n = Math.floor(next.distance / size);
    if (n <= Math.floor(prev.distance / size)) return null;
    meters = n * size;
  } else {
    cued = Math.floor(time / every);
    if (cued <= (next.cued ?? 0)) return null;
  }
  const { label, short } = effort(next.sport);
  const parts = {
    time: () => t('Temps {time}.', { time: spokenTime(time) }),
    distance: () => `${spokenDistance(next.sport, meters)}.`,
    avg: () => spokenEffort(next.sport, next.distance > 10 ? time / (next.distance / 1000) : null, label),
    pace: () => spokenEffort(next.sport, currentPace(next), t('{name} actuelle', { name: short })),
    hr: () => (bpm ? t('Cardio {n}.', { n: bpm }) : null),
  };
  const text = fields.map((f) => parts[f]?.()).filter(Boolean).join(' ');
  return text ? { text, cued } : null;
}
