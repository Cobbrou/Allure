/** Seconds to "h:mm:ss" or "m:ss". */
export function fmtDuration(s) {
  if (s == null) return '—';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds per km to "m:ss". */
export function fmtPace(sPerKm) {
  if (!sPerKm || !Number.isFinite(sPerKm)) return '—';
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
