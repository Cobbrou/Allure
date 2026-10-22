// Platform module (network): hourly forecast from Open-Meteo (no key). The position sent is
// rounded to 0.1° (~10 km): enough for the weather, not a home address.

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';

/** Hourly forecast for the next 7 days: [{ time (ms), temp, dew }] (°C). Throws when offline. */
export async function forecast(lat, lon) {
  const r = (v) => Math.round(v * 10) / 10;
  const q = new URLSearchParams({ latitude: r(lat), longitude: r(lon), hourly: 'temperature_2m,dew_point_2m', forecast_days: 7, timezone: 'auto', timeformat: 'unixtime' });
  const res = await fetch(`${URL_BASE}?${q}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { hourly: h } = await res.json();
  return h.time.map((s, i) => ({ time: s * 1000, temp: h.temperature_2m[i], dew: h.dew_point_2m[i] }));
}

/** The forecast hour closest to `time`, or null when it is out of the forecast range. */
export const hourAt = (hours, time) => {
  const best = hours.reduce((b, x) => (!b || Math.abs(x.time - time) < Math.abs(b.time - time) ? x : b), null);
  return best && Math.abs(best.time - time) <= 3600e3 ? best : null;
};
