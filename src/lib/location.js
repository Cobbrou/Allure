// Platform module for live recording: GPS, screen wake lock, spoken cues.
// Web APIs in development; in the native shell, recording uses the background
// geolocation plugin (a foreground service keeps the GPS on with the screen off).

import { locale, t } from './i18n.js';
import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Watch the position. Calls onFix({ lat, lon, ele, time, accuracy, speed }) and
 * onError(message). Returns a stop function. background: keep receiving fixes with the
 * screen off (native shell only; shows the "recording" notification on Android).
 * maxAge: accept a cached fix up to that old (ms) as the first one, for a fast first answer.
 * Dev only: `?sim=5` in the URL replays a demo run at 5× speed instead of the real GPS.
 */
export function watchPosition(onFix, onError, { background = false, maxAge = 0 } = {}) {
  const sim = import.meta.env?.DEV && Number(new URLSearchParams(location.search).get('sim'));
  if (sim) return simulate(sim, onFix);
  if (background && Capacitor.isNativePlatform()) return watchNative(onFix, onError);
  if (!navigator.geolocation) {
    onError(t('GPS indisponible sur cet appareil.'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    ({ coords: c, timestamp }) =>
      onFix({ lat: c.latitude, lon: c.longitude, ele: c.altitude, time: timestamp, accuracy: c.accuracy, speed: c.speed }),
    (e) => onError(t(e.code === e.PERMISSION_DENIED ? 'Accès à la position refusé.' : 'Signal GPS perdu.')),
    { enableHighAccuracy: true, maximumAge: maxAge, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

let BackgroundGeolocation;

/** Native shell: @capacitor-community/background-geolocation watcher. */
function watchNative(onFix, onError) {
  BackgroundGeolocation ??= registerPlugin('BackgroundGeolocation');
  let stopped = false;
  const id = BackgroundGeolocation.addWatcher(
    { backgroundTitle: t('Enregistrement en cours'), backgroundMessage: t('Allure suit ta position pour ton activité.'), requestPermissions: true, stale: false, distanceFilter: 0 },
    (loc, err) => {
      if (err) return onError(t(err.code === 'NOT_AUTHORIZED' ? 'Accès à la position refusé.' : 'Signal GPS perdu.'));
      onFix({ lat: loc.latitude, lon: loc.longitude, ele: loc.altitude, time: loc.time, accuracy: loc.accuracy, speed: loc.speed });
    },
  );
  id.catch(() => onError(t('GPS indisponible sur cet appareil.')));
  return () => {
    if (stopped) return;
    stopped = true;
    id.then((watcherId) => BackgroundGeolocation.removeWatcher({ id: watcherId }), () => {});
  };
}

function simulate(speedup, onFix) {
  let timer, stopped = false;
  import('./demo.js').then(({ demoTrack }) => { // dev only: kept out of the bundle
    if (stopped) return;
    const track = demoTrack({ km: 5, start: 0 });
    const t0 = Date.now();
    let i = 0;
    timer = setInterval(() => {
      while (i < track.length && track[i].time <= (Date.now() - t0) * speedup) {
        const p = track[i++];
        onFix({ lat: p.lat, lon: p.lon, ele: p.ele, time: t0 + p.time / speedup, accuracy: 5, speed: null });
      }
    }, 250);
  });
  return () => { stopped = true; clearInterval(timer); };
}

/** Keep the screen on. Re-acquired when the page becomes visible again. Returns a release function. */
export function keepAwake() {
  if (!navigator.wakeLock) return () => {};
  let lock, done = false;
  const acquire = () => {
    if (done || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then((l) => (done ? l.release() : (lock = l)), () => {});
  };
  acquire();
  document.addEventListener('visibilitychange', acquire);
  return () => {
    done = true;
    document.removeEventListener('visibilitychange', acquire);
    lock?.release();
  };
}

/** Stop any pending or ongoing announcement. */
export function hush() { window.speechSynthesis?.cancel(); }

export function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { lang: locale() }));
}

let tones;
/** Short tone (countdown). The first call must come from a tap: browsers start audio suspended. */
export function beep(ms = 150, hz = 880) {
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return;
  tones ??= new Ctx();
  tones.resume();
  const osc = tones.createOscillator();
  const gain = tones.createGain();
  const at = tones.currentTime;
  const end = at + ms / 1000;
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0.4, at);
  gain.gain.setValueAtTime(0.4, end - 0.03);
  gain.gain.linearRampToValueAtTime(0, end); // no click at the cut
  osc.connect(gain).connect(tones.destination);
  osc.start(at);
  osc.stop(end);
}

/** One position fix ({ lat, lon }), or null if the GPS gives nothing within `timeout` ms. */
export function currentPosition(timeout = 10000) {
  return new Promise((resolve) => {
    let stop = () => {};
    const done = (v) => { clearTimeout(t); stop(); resolve(v); };
    const t = setTimeout(() => done(null), timeout);
    stop = watchPosition((f) => done({ lat: f.lat, lon: f.lon }), () => done(null));
  });
}

/** Location permission: 'granted' | 'denied' | 'prompt', or null when the platform can't tell. */
export async function locationPermission() {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return null;
  }
}
