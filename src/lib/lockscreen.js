// Platform module for lock-screen and notification controls while recording, through the
// Media Session API. Browsers only show media controls while audio plays, so a silent
// looping track plays for the whole recording. A native foreground-service notification
// can replace it.

import { t } from './i18n.js';

/** 1 s of 8 kHz 8-bit mono silence as a WAV blob URL. */
function silence() {
  const n = 8000, b = new DataView(new ArrayBuffer(44 + n));
  const str = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); b.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true); b.setUint32(28, 8000, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true);
  str(36, 'data'); b.setUint32(40, n, true);
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

/**
 * Show recording controls on the lock screen. onPause / onResume run from the media
 * buttons. Must start from a user gesture. Returns { update({ title, paused }), stop() }.
 */
export function lockScreenControls({ onPause, onResume }) {
  const ms = navigator.mediaSession;
  if (!ms || typeof MediaMetadata === 'undefined') return { update() {}, stop() {} };
  const url = silence();
  const audio = Object.assign(new Audio(url), { loop: true });
  audio.play().catch(() => {});
  ms.setActionHandler('pause', onPause);
  ms.setActionHandler('play', onResume);
  let last = '';
  return {
    update({ title, paused }) {
      ms.playbackState = paused ? 'paused' : 'playing';
      if (title === last) return;
      last = title;
      ms.metadata = new MediaMetadata({ title, artist: 'Allure', album: t(paused ? 'En pause' : 'Enregistrement') });
    },
    stop() {
      audio.pause();
      URL.revokeObjectURL(url);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('play', null);
      ms.metadata = null;
      ms.playbackState = 'none';
    },
  };
}
