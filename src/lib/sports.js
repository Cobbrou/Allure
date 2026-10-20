import { distLen, fmtPace, fmtPaceUnit, fmtSpeed, paceUnit, shortLen, shortUnit, speedUnit } from './format.js';
import { haversine } from './geo.js';
import { t } from './i18n.js';

// display: how average effort is shown. 'speed' = km/h, 'pace' = min/km, 'pace100' = min/100 m
// (mi/h, min/mi and min/100 yd in imperial units).
// split: split length in display units (km or mi; m or yd for swims), see splitSize.
// moving: m/s above which the athlete counts as moving (a steep climb on foot is ~0.3).
// max: m/s no athlete reaches in that sport: a faster move between two fixes is a GPS spike.
export const SPORTS = {
  run: { get label() { return t('Course'); }, icon: '🏃', display: 'pace', split: 1, moving: 0.5, max: 12 },
  ride: { get label() { return t('Vélo'); }, icon: '🚴', display: 'speed', split: 5, moving: 0.5, max: 30 },
  hike: { get label() { return t('Randonnée'); }, icon: '🥾', display: 'pace', split: 1, moving: 0.2, max: 8 },
  walk: { get label() { return t('Marche'); }, icon: '🚶', display: 'pace', split: 1, moving: 0.25, max: 8 },
  swim: { get label() { return t('Natation'); }, icon: '🏊', display: 'pace100', split: 100, moving: 0.2, max: 4 },
};

/** True when going from point a to b (timed {lat, lon}) means an impossible speed for the sport. */
export function isSpike(a, b, sport) {
  const dt = (b.time - a.time) / 1000;
  return dt > 0 && haversine(a, b) / dt > (SPORTS[sport] ?? SPORTS.run).max;
}

const SPIKE_RUN = 5; // a jump longer than this many points is real movement (a wrong sport, a car), not a spike

/**
 * The points without GPS spikes: a point too fast to reach from the last one kept is dropped
 * when the track comes back within SPIKE_RUN points (an out-and-back jump). A sustained fast
 * stretch is kept: a ride imported as a run must not lose its track.
 */
export function dropSpikes(points, sport) {
  const out = [];
  points.forEach((p, i) => {
    const last = out.at(-1);
    const back = last && isSpike(last, p, sport) && points.slice(i + 1, i + 1 + SPIKE_RUN).some((q) => !isSpike(last, q, sport));
    if (!back) out.push(p);
  });
  return out.length === points.length ? points : out;
}

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
