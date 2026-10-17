// Platform module for live recording: GPS, screen wake lock, spoken cues.
// Web APIs in development; native plugins (background location, BLE) can replace it.

import { demoTrack } from './demo.js';

/**
 * Watch the position. Calls onFix({ lat, lon, ele, time, accuracy, speed }) and
 * onError(message). Returns a stop function.
 * Dev only: `?sim=5` in the URL replays a demo run at 5× speed instead of the real GPS.
 */
export function watchPosition(onFix, onError) {
  const sim = import.meta.env?.DEV && Number(new URLSearchParams(location.search).get('sim'));
  if (sim) return simulate(sim, onFix);
  if (!navigator.geolocation) {
    onError('GPS indisponible sur cet appareil.');
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    ({ coords: c, timestamp }) =>
      onFix({ lat: c.latitude, lon: c.longitude, ele: c.altitude, time: timestamp, accuracy: c.accuracy, speed: c.speed }),
    (e) => onError(e.code === e.PERMISSION_DENIED ? 'Accès à la position refusé.' : 'Signal GPS perdu.'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

function simulate(speedup, onFix) {
  const track = demoTrack({ km: 5, start: 0 });
  const t0 = Date.now();
  let i = 0;
  const timer = setInterval(() => {
    while (i < track.length && track[i].time <= (Date.now() - t0) * speedup) {
      const p = track[i++];
      onFix({ lat: p.lat, lon: p.lon, ele: p.ele, time: t0 + p.time / speedup, accuracy: 5, speed: null });
    }
  }, 250);
  return () => clearInterval(timer);
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

export function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { lang: 'fr-FR' }));
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
