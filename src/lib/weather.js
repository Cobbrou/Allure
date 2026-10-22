// Platform module (network): weather from Open-Meteo (no key), forecast for plan sessions and
// history for activities. The position sent is rounded to 0.1° (~10 km): enough for the
// weather, not a home address.

import { isImperial } from './format.js';
import { t } from './i18n.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const RECENT = 60 * 86400e3; // ms: the forecast API keeps this much past; the archive the rest

/** Hourly values [{ time (ms), ...fields }] from an Open-Meteo endpoint; throws when offline. */
async function hourly(url, lat, lon, fields, params) {
  const r = (v) => Math.round(v * 10) / 10;
  const q = new URLSearchParams({ latitude: r(lat), longitude: r(lon), hourly: Object.values(fields).join(','), timezone: 'GMT', timeformat: 'unixtime', wind_speed_unit: 'ms', ...params });
  const res = await fetch(`${url}?${q}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { hourly: h } = await res.json();
  return h.time.map((s, i) => Object.fromEntries([['time', s * 1000], ...Object.entries(fields).map(([k, f]) => [k, h[f][i]])]));
}

/** Hourly forecast for the next 7 days: [{ time (ms), temp, dew }] (°C). */
export const forecast = (lat, lon) => hourly(FORECAST, lat, lon, { temp: 'temperature_2m', dew: 'dew_point_2m' }, { forecast_days: 7 });

/** The hour closest to `time`, or null when none is within an hour. */
export const hourAt = (hours, time) => {
  const best = hours.reduce((b, x) => (!b || Math.abs(x.time - time) < Math.abs(b.time - time) ? x : b), null);
  return best && Math.abs(best.time - time) <= 3600e3 ? best : null;
};

/**
 * Weather at a past `time` (an activity start): { temp, feels (°C), humidity (%), wind (m/s),
 * code (WMO) }, or null when the service has no data for that hour.
 */
export async function weatherAt(lat, lon, time) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const hours = await hourly(Date.now() - time < RECENT ? FORECAST : ARCHIVE, lat, lon,
    { temp: 'temperature_2m', feels: 'apparent_temperature', humidity: 'relative_humidity_2m', wind: 'wind_speed_10m', code: 'weather_code' },
    { start_date: day(time - 3600e3), end_date: day(time + 3600e3) });
  const h = hourAt(hours, time);
  if (!h || h.temp == null) return null;
  const { time: _, ...w } = h;
  return w;
}

// WMO weather codes, by the lowest code of each group.
const SKIES = [
  [0, '☀️', () => t('Ensoleillé')], [1, '🌤️', () => t('Peu nuageux')], [2, '⛅', () => t('Nuageux')], [3, '☁️', () => t('Couvert')],
  [45, '🌫️', () => t('Brouillard')], [51, '🌦️', () => t('Bruine')], [61, '🌧️', () => t('Pluie')], [71, '❄️', () => t('Neige')],
  [80, '🌦️', () => t('Averses')], [85, '🌨️', () => t('Averses de neige')], [95, '⛈️', () => t('Orage')],
];

/** { icon, label } of a WMO weather code. */
export function sky(code) {
  const [, icon, label] = SKIES.findLast(([c]) => c <= code) ?? SKIES[0];
  return { icon, label: label() };
}

/** "☀️ Ensoleillé · 18 °C · vent 12 km/h · 60 %" in the display units. */
export function fmtWeather(w) {
  const imp = isImperial(), s = sky(w.code);
  const temp = Math.round(imp ? w.temp * 1.8 + 32 : w.temp);
  const wind = Math.round(w.wind * (imp ? 2.23694 : 3.6));
  return `${s.icon} ${s.label} · ${temp} ${imp ? '°F' : '°C'} · ${t('vent {n} {unit}', { n: wind, unit: imp ? 'mph' : 'km/h' })} · ${Math.round(w.humidity)} %`;
}
