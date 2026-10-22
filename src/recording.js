import { useCallback, useEffect, useRef, useState } from 'react';
import { createActivity, indoorActivity } from './lib/activity.js';
import { clearDraft, loadDraft, saveActivities, saveDraft } from './lib/db.js';
import { correctElevation } from './lib/elevation.js';
import { followCue } from './lib/follow.js';
import { distUnit, fmtDist, fmtDuration } from './lib/format.js';
import { t } from './lib/i18n.js';
import { haptic } from './lib/haptics.js';
import { segmentCue } from './lib/liveSegments.js';
import { keepAwake, speak, watchPosition } from './lib/location.js';
import { lockScreenControls } from './lib/lockscreen.js';
import { addFix, addReadings, elapsed, lap, lapCue, lapStarts, lapStatus, hrAlert, pause, recover, resume, startRecording, tick, voiceCue } from './lib/recorder.js';
import { connectSensor } from './lib/sensors.js';
import { nextStep, paceCueText, savedWorkout, stepCue, workoutStep } from './lib/workout.js';

const SAVE_EVERY = 5000; // ms between draft autosaves
const FRESH = 5000; // ms a sensor reading stays valid for the next GPS fix
const MIN_INDOOR = 60; // s: an indoor recording shorter than this is not saved

/**
 * Live recording state, held by App so it survives tab switches.
 * rec: null when idle. gpsError: last GPS error message, if any.
 * sensors: connected Bluetooth sensors by kind ('hr' | 'cadence' | 'power'): { name, hr?, cad?, power? }.
 * lost: kinds of sensors that dropped during this recording and are not back yet.
 * onSensorLost(kind): a sensor dropped and could not reconnect.
 */
export function useRecording({ onSensorLost } = {}) {
  const [rec, setRec] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [sensors, setSensors] = useState({});
  const [lost, setLost] = useState([]);
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
    const alert = next.hrAlertAt !== prev.hrAlertAt;
    if (alert) haptic('alert');
    const step = next.workout && next.workout.i !== prev.workout?.i;
    if (step) haptic('lap');
    const paceCue = !step && next.workout?.cueAt !== prev.workout?.cueAt && next.workout.cue;
    if (paceCue) haptic('alert');
    if (next.audio) {
      const voice = voiceCue(prev, next, Date.now(), freshHr());
      if (voice?.cued != null) next = { ...next, cued: voice.cued };
      const cue = (step ? stepCue(next) : null) ?? (paceCue ? paceCueText(paceCue) : null) ?? (alert ? t('Cardio élevé : {n}.', { n: freshHr() }) : null) ?? followCue(prev, next) ?? segmentCue(prev, next) ?? voice?.text;
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

  const active = rec != null, indoor = !!rec?.indoor;
  useEffect(() => {
    if (!active) return;
    setGpsError(null);
    const stop = indoor ? () => {} : watchPosition((fix) => {
      setGpsError(null);
      const data = fresh();
      update((r) => addFix(r, { ...fix, ...data }));
    }, setGpsError, { background: true });
    const timer = setInterval(() => {
      const now = Date.now();
      update((r) => hrAlert(workoutStep(tick(addReadings(r, fresh(), now), now), now), freshHr(), now));
      const r = ref.current;
      lock.current?.update({ title: `${fmtDist(r.distance)} ${distUnit()} · ${fmtDuration(elapsed(r, Date.now()))}`, paused: r.paused || r.autoPaused });
    }, 1000);
    const release = keepAwake();
    return () => { stop(); clearInterval(timer); release(); };
  }, [active, indoor, update]);

  return {
    rec,
    gpsError,
    sensors,
    lost,
    start: (opts) => { haptic('start'); showLock(); setLost([]); return set(startRecording(opts, Date.now())); },
    pause: doPause,
    resume: doResume,
    discard: () => { hideLock(); return set(null); },
    lap: () => {
      const now = Date.now();
      if (ref.current.workout?.steps[ref.current.workout.i]) return update((r) => nextStep(r, now)); // skips to the next step
      const done = lapStatus(ref.current, now);
      haptic('lap');
      set(lap(ref.current, now));
      if (ref.current.audio) speak(lapCue(done.n, done.time));
    },
    /** Saves the activity and returns its id, or null if the track is too short. */
    // The draft stays stored until the activity is saved, so waiting on the DEM loses nothing.
    finish: () => (finishing.current ??= (async () => {
      const r = ref.current, now = Date.now();
      let act;
      if (r.indoor) {
        if (elapsed(r, now) < MIN_INDOOR) return null;
        act = indoorActivity({ sport: r.sport, samples: [{ time: r.start }, ...r.points, { time: now }], movingTime: Math.round(elapsed(r, now)), source: 'record' });
      } else {
        if (r.points.length < 2) return null;
        act = createActivity({ sport: r.sport, points: await correctElevation(r.points), source: 'record', laps: lapStarts(r) });
      }
      if (r.workout) act.meta.workout = savedWorkout(r, now);
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
        () => { drop(kind); setLost((l) => l.includes(kind) ? l : [...l, kind]); onSensorLost?.(kind); },
      );
      sensor.current[kind] = { disconnect: c.disconnect, data: {}, at: 0 };
      setSensors((all) => ({ ...all, [kind]: { name: c.name } }));
      setLost((l) => l.filter((k) => k !== kind));
    },
    disconnectSensor: (kind) => { sensor.current[kind]?.disconnect(); drop(kind); },
  };
}
