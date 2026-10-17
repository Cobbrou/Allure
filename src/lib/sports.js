import { distLen, fmtPace, fmtPaceUnit, fmtSpeed, paceUnit, shortLen, shortUnit, speedUnit } from './format.js';
import { t } from './i18n.js';

// display: how average effort is shown. 'speed' = km/h, 'pace' = min/km, 'pace100' = min/100 m
// (mi/h, min/mi and min/100 yd in imperial units).
// split: split length in display units (km or mi; m or yd for swims), see splitSize.
export const SPORTS = {
  run: { get label() { return t('Course'); }, icon: '🏃', display: 'pace', split: 1 },
  ride: { get label() { return t('Vélo'); }, icon: '🚴', display: 'speed', split: 5 },
  hike: { get label() { return t('Randonnée'); }, icon: '🥾', display: 'pace', split: 1 },
  walk: { get label() { return t('Marche'); }, icon: '🚶', display: 'pace', split: 1 },
  swim: { get label() { return t('Natation'); }, icon: '🏊', display: 'pace100', split: 100 },
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
      return { label: t('Vitesse moyenne'), short: t('Vitesse'), value: fmtSpeed(sPerKm), unit: speedUnit() };
    case 'pace100':
      return { label: t('Allure moyenne'), short: t('Allure'), value: fmtPace((sPerKm / 10) * shortLen()), unit: `/100${shortUnit()}` };
    default:
      return { label: t('Allure moyenne'), short: t('Allure'), value: fmtPaceUnit(sPerKm), unit: paceUnit() };
  }
}

/** Split length in meters for the current unit system. */
export function splitSize(sport) {
  const s = SPORTS[sport] ?? SPORTS.run;
  return s.split * (s.display === 'pace100' ? shortLen() : distLen());
}

/** Grade Adjusted Pace only makes sense on foot. */
export const usesGap = (sport) => SPORTS[sport]?.display === 'pace';

/** Segmented options for a sport filter: "Tous" plus the sports present in `metas`. */
export function sportOptions(metas) {
  const present = new Set(metas.map((a) => a.sport));
  return [{ id: '', label: t('Tous') }, ...Object.entries(SPORTS).filter(([id]) => present.has(id)).map(([id, s]) => ({ id, label: `${s.icon} ${s.label}` }))];
}
