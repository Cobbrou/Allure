import { fmtPace } from './format.js';

// `speed: true` sports display km/h instead of a pace.
// ponytail: swim uses /km like running; switch to /100m when pool swims are supported.
export const SPORTS = {
  run: { label: 'Course', icon: '🏃', speed: false },
  ride: { label: 'Vélo', icon: '🚴', speed: true },
  hike: { label: 'Randonnée', icon: '🥾', speed: false },
  walk: { label: 'Marche', icon: '🚶', speed: false },
  swim: { label: 'Natation', icon: '🏊', speed: false },
};

/** Map a GPX <type> value (Strava, Garmin, numeric codes…) to a sport id. */
export function sportFromGpxType(type = '') {
  if (/cycl|bik|ride|vélo|velo/i.test(type)) return 'ride';
  if (/hik|rando/i.test(type)) return 'hike';
  if (/walk|marche/i.test(type)) return 'walk';
  if (/swim|nata/i.test(type)) return 'swim';
  return 'run';
}

/** Pace for foot sports, speed for rides. sPerKm: seconds per km. */
export function effort(sport, sPerKm) {
  return SPORTS[sport]?.speed
    ? { label: 'Vitesse moyenne', short: 'Vitesse', value: sPerKm ? (3600 / sPerKm).toFixed(1) : '—', unit: 'km/h' }
    : { label: 'Allure moyenne', short: 'Allure', value: fmtPace(sPerKm), unit: '/km' };
}
