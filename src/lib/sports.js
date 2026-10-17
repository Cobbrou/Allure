import { fmtPace } from './format.js';

// display: how average effort is shown. 'speed' = km/h, 'pace' = min/km, 'pace100' = min/100 m.
// split: split length in meters.
export const SPORTS = {
  run: { label: 'Course', icon: '🏃', display: 'pace', split: 1000 },
  ride: { label: 'Vélo', icon: '🚴', display: 'speed', split: 5000 },
  hike: { label: 'Randonnée', icon: '🥾', display: 'pace', split: 1000 },
  walk: { label: 'Marche', icon: '🚶', display: 'pace', split: 1000 },
  swim: { label: 'Natation', icon: '🏊', display: 'pace100', split: 100 },
};

/** Map a GPX/TCX/FIT sport value (Strava, Garmin, numeric codes…) to a sport id. */
export function sportFromGpxType(type = '') {
  if (/cycl|bik|ride|vélo|velo/i.test(type)) return 'ride';
  if (/hik|rando/i.test(type)) return 'hike';
  if (/walk|marche/i.test(type)) return 'walk';
  if (/swim|nata/i.test(type)) return 'swim';
  return 'run';
}

/** Average effort for display: speed for rides, pace per km or per 100 m otherwise. sPerKm: seconds per km. */
export function effort(sport, sPerKm) {
  switch (SPORTS[sport]?.display) {
    case 'speed':
      return { label: 'Vitesse moyenne', short: 'Vitesse', value: sPerKm ? (3600 / sPerKm).toFixed(1) : '—', unit: 'km/h' };
    case 'pace100':
      return { label: 'Allure moyenne', short: 'Allure', value: fmtPace(sPerKm / 10), unit: '/100m' };
    default:
      return { label: 'Allure moyenne', short: 'Allure', value: fmtPace(sPerKm), unit: '/km' };
  }
}

/** Grade Adjusted Pace only makes sense on foot. */
export const usesGap = (sport) => SPORTS[sport]?.display === 'pace';

/** Segmented options for a sport filter: "Tous" plus the sports present in `metas`. */
export function sportOptions(metas) {
  const present = new Set(metas.map((a) => a.sport));
  return [{ id: '', label: 'Tous' }, ...Object.entries(SPORTS).filter(([id]) => present.has(id)).map(([id, s]) => ({ id, label: `${s.icon} ${s.label}` }))];
}
