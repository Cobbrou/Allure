import { useCallback, useEffect, useRef, useState } from 'react';
import { createActivity } from './lib/activity.js';
import { clearDraft, loadDraft, saveActivities, saveDraft } from './lib/db.js';
import { keepAwake, speak, watchPosition } from './lib/location.js';
import { followCue } from './lib/follow.js';
import { addFix, pause, recover, resume, splitCue, startRecording, tick } from './lib/recorder.js';

const SAVE_EVERY = 5000; // ms between draft autosaves

/**
 * Live recording state, held by App so it survives tab switches.
 * rec: null when idle. gpsError: last GPS error message, if any.
 */
export function useRecording() {
  const [rec, setRec] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const ref = useRef(null);
  const lastSave = useRef(0);

  const update = useCallback((fn) => {
    const prev = ref.current;
    const next = prev && fn(prev);
    if (!next || next === prev) return;
    if (next.audio) {
      const cue = followCue(prev, next) ?? splitCue(prev, next, Date.now());
      if (cue) speak(cue);
    }
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

  useEffect(() => { loadDraft().then((d) => d && !ref.current && set(recover(d)), () => {}); }, []);

  const active = rec != null;
  useEffect(() => {
    if (!active) return;
    setGpsError(null);
    const stop = watchPosition((fix) => { setGpsError(null); update((r) => addFix(r, fix)); }, setGpsError);
    const timer = setInterval(() => update((r) => tick(r, Date.now())), 1000);
    const release = keepAwake();
    return () => { stop(); clearInterval(timer); release(); };
  }, [active, update]);

  return {
    rec,
    gpsError,
    start: (opts) => set(startRecording(opts, Date.now())),
    pause: () => set(pause(ref.current, Date.now())),
    resume: () => set(resume(ref.current, Date.now())),
    discard: () => set(null),
    /** Saves the activity and returns its id, or null if the track is too short. */
    finish: async () => {
      const r = ref.current;
      if (r.points.length < 2) return null;
      const act = createActivity({ sport: r.sport, points: r.points, source: 'record' });
      await saveActivities([act]);
      await set(null);
      return act.meta.id;
    },
  };
}
