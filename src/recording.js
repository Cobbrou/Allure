import { useCallback, useEffect, useRef, useState } from 'react';
import { createActivity } from './lib/activity.js';
import { clearDraft, loadDraft, saveActivities, saveDraft } from './lib/db.js';
import { correctElevation } from './lib/elevation.js';
import { followCue } from './lib/follow.js';
import { distUnit, fmtDist, fmtDuration } from './lib/format.js';
import { haptic } from './lib/haptics.js';
import { segmentCue } from './lib/liveSegments.js';
import { keepAwake, speak, watchPosition } from './lib/location.js';
import { lockScreenControls } from './lib/lockscreen.js';
import { addFix, addReadings, elapsed, lap, lapCue, lapStarts, lapStatus, pause, recover, resume, startRecording, tick, voiceCue } from './lib/recorder.js';
import { connectSensor } from './lib/sensors.js';

const SAVE_EVERY = 5000; // ms between draft autosaves
const FRESH = 5000; // ms a sensor reading stays valid for the next GPS fix

/**
 * Live recording state, held by App so it survives tab switches.
 * rec: null when idle. gpsError: last GPS error message, if any.
 * sensors: connected Bluetooth sensors by kind ('hr' | 'cadence' | 'power'): { name, hr?, cad?, power? }.
 * onSensorLost(kind): a sensor dropped and could not reconnect.
 */
export function useRecording({ onSensorLost } = {}) {
  const [rec, setRec] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [sensors, setSensors] = useState({});
  const ref = useRef(null);
  const lastSave = useRef(0);
  const sensor = useRef({}); // kind → { disconnect, data, at }
  const lock = useRef(null); // lock-screen controls while recording
  const finishing = useRef(null); // the save in progress: a second tap waits for it

  /** Latest readings of every sensor, merged: { hr?, cad?, power? }. Stale ones are left out. */
  const fresh = () => {
    const out = {};
    for (const s of Object.values(sensor.current)) if (Date.now() - s.at < FRESH) Object.assign(out, s.data);
    return out;
  };
  const freshHr = () => fresh().hr || null;
  const drop = (kind) => {
    delete sensor.current[kind];
    setSensors(({ [kind]: _, ...rest }) => rest);
  };

  const update = useCallback((fn) => {
    const prev = ref.current;
    let next = prev && fn(prev);
    if (!next || next === prev) return;
    if (next.audio) {
      const voice = voiceCue(prev, next, Date.now(), freshHr());
      if (voice?.cued != null) next = { ...next, cued: voice.cued };
      const cue = followCue(prev, next) ?? segmentCue(prev, next) ?? voice?.text;
      if (cue) speak(cue);
    }
    const done = next.seg?.last;
    if (done && done !== prev.seg?.last && done.pr != null && done.time < done.pr) haptic('success');
    ref.current = next;
    setRec(next);
    if (next.points !== prev.points && Date.now() - lastSave.current > SAVE_EVERY) {
      lastSave.current = Date.now();
      saveDraft(next).catch(() => {});
    }
  }, []);

  const set = (r) => {
    ref.current = r;
    setRec(r);
    return r ? saveDraft(r) : clearDraft();
  };

  const doPause = () => { haptic('pause'); set(pause(ref.current, Date.now())); };
  const doResume = () => { haptic('start'); showLock(); set(resume(ref.current, Date.now())); };
  // Lock-screen controls need a user gesture to start their (silent) audio: start, resume.
  const showLock = () => { lock.current ??= lockScreenControls({ onPause: doPause, onResume: doResume }); };
  const hideLock = () => { lock.current?.stop(); lock.current = null; };

  useEffect(() => { loadDraft().then((d) => d && !ref.current && set(recover(d)), () => {}); }, []);

  const active = rec != null;
  useEffect(() => {
    if (!active) return;
    setGpsError(null);
    const stop = watchPosition((fix) => {
      setGpsError(null);
      const data = fresh();
      update((r) => addFix(r, { ...fix, ...data }));
    }, setGpsError, { background: true });
    const timer = setInterval(() => {
      const now = Date.now();
      update((r) => tick(addReadings(r, fresh(), now), now));
      const r = ref.current;
      lock.current?.update({ title: `${fmtDist(r.distance)} ${distUnit()} · ${fmtDuration(elapsed(r, Date.now()))}`, paused: r.paused || r.autoPaused });
    }, 1000);
    const release = keepAwake();
    return () => { stop(); clearInterval(timer); release(); };
  }, [active, update]);

  return {
    rec,
    gpsError,
    sensors,
    start: (opts) => { haptic('start'); showLock(); return set(startRecording(opts, Date.now())); },
    pause: doPause,
    resume: doResume,
    discard: () => { hideLock(); return set(null); },
    lap: () => {
      const now = Date.now();
      const done = lapStatus(ref.current, now);
      haptic('lap');
      set(lap(ref.current, now));
      if (ref.current.audio) speak(lapCue(done.n, done.time));
    },
    /** Saves the activity and returns its id, or null if the track is too short. */
    // The draft stays stored until the activity is saved, so waiting on the DEM loses nothing.
    finish: () => (finishing.current ??= (async () => {
      const r = ref.current;
      if (r.points.length < 2) return null;
      const points = await correctElevation(r.points);
      const act = createActivity({ sport: r.sport, points, source: 'record', laps: lapStarts(r) });
      await saveActivities([act]);
      hideLock();
      haptic('success');
      await set(null);
      return act.meta.id;
    })().finally(() => { finishing.current = null; })),
    /** Pair a sensor of a kind (from a tap: the browser shows its device picker). */
    connectSensor: async (kind) => {
      const c = await connectSensor(
        kind,
        (data) => {
          const s = sensor.current[kind];
          if (!s) return;
          s.data = { ...s.data, ...data };
          s.at = Date.now();
          setSensors((all) => all[kind] ? { ...all, [kind]: { ...all[kind], ...data } } : all);
        },
        () => { drop(kind); onSensorLost?.(kind); },
      );
      sensor.current[kind] = { disconnect: c.disconnect, data: {}, at: 0 };
      setSensors((all) => ({ ...all, [kind]: { name: c.name } }));
    },
    disconnectSensor: (kind) => { sensor.current[kind]?.disconnect(); drop(kind); },
  };
}
