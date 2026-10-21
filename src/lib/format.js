import { locale } from './i18n.js';

/** Seconds to "h:mm:ss" or "m:ss". */
export function fmtDuration(s) {
  if (s == null) return '—';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds to a rounded "h mm" or "m min", for estimates. */
export function fmtHm(s) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** Seconds per km to "m:ss". */
export function fmtPace(sPerKm) {
  if (!sPerKm || !Number.isFinite(sPerKm)) return '—';
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Date and time, e.g. "Mon 12 Oct, 08:30". */
export const fmtDate = (d) =>
  new Date(d).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/**
 * Day, e.g. "12 Oct"; year: 'numeric' or '2-digit' to add it. Anything else is ignored: as a
 * chart tickFormatter it gets the tick index as its second argument.
 */
export const fmtDay = (d, year) =>
  new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short', ...((year === 'numeric' || year === '2-digit') && { year }) });
/** Month, e.g. "October 2026". */
export const fmtMonth = (d) => new Date(d).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
/** Number typed by the athlete, with a decimal comma or point; NaN when it isn't one. */
export const parseNum = (v) => Number(String(v).trim().replace(',', '.'));

// Display unit system. Everything is stored in SI; only display converts. Metric by default:
// App sets it from the `units` setting before rendering and remounts the tree on change,
// so components can read it during render.
export const MILE = 1609.344, FOOT = 0.3048, YARD = 0.9144;
let imperial = false;
export const setUnits = (units) => { imperial = units === 'imperial'; };
export const isImperial = () => imperial;

/** Meters in one display distance unit (km or mile), one short unit (m or yd), one elevation unit (m or ft). */
export const distLen = () => (imperial ? MILE : 1000);
export const shortLen = () => (imperial ? YARD : 1);
export const elevLen = () => (imperial ? FOOT : 1);
export const distUnit = () => (imperial ? 'mi' : 'km');
export const shortUnit = () => (imperial ? 'yd' : 'm');
export const elevUnit = () => (imperial ? 'ft' : 'm');
export const speedUnit = () => (imperial ? 'mi/h' : 'km/h');
export const paceUnit = () => (imperial ? '/mi' : '/km');

/** Meters as a distance number in km or miles: fmtDist(12345) -> "12.35". */
export const fmtDist = (m, digits = 2) => (m / distLen()).toFixed(digits);
/** Meters as a rounded elevation in m or ft. */
export const fmtElev = (m) => String(Math.round(m / elevLen()));
/** Meters as a short distance: "850 m" / "930 yd" under one km or mile, else "1.20 km" / "1.20 mi". */
export const fmtLength = (m) => (m < distLen() ? `${Math.round(m / shortLen() / 10) * 10} ${shortUnit()}` : `${fmtDist(m)} ${distUnit()}`);
/** Seconds per km to speed in km/h or mi/h. */
export const fmtSpeed = (sPerKm) => (sPerKm ? (3600000 / (sPerKm * distLen())).toFixed(1) : '—');
/** Seconds per km to "m:ss" per km or per mile. */
export const fmtPaceUnit = (sPerKm) => fmtPace(sPerKm && (sPerKm * distLen()) / 1000);
