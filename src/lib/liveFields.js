import { smoothEle } from './analyze.js';
import { distUnit, elevUnit, fmtDist, fmtDuration, fmtElev, fmtSpeed, speedUnit } from './format.js';
import { locale, t } from './i18n.js';
import { currentPace, lapStatus } from './recorder.js';
import { effort } from './sports.js';
import { ZONES, zoneOf } from './training.js';

// Metrics the live record screen can show. Each field: `name` for the editor, and `get(ctx)`
// returning { label, value, unit? }. ctx: { rec, now, time (running s), bpm (or null), maxHr }.

const sPerKm = (seconds, meters) => (meters > 10 ? seconds / (meters / 1000) : null);
const withEffort = (label, sport, pace) => {
  const e = effort(sport, pace);
  return { label: label(e.short), value: e.value, unit: e.unit };
};

export const FIELDS = {
  time: { get name() { return t('Temps'); }, get: ({ time }) => ({ label: t('Temps'), value: fmtDuration(time) }) },
  distance: { get name() { return t('Distance'); }, get: ({ rec }) => ({ label: t('Distance'), value: fmtDist(rec.distance), unit: distUnit() }) },
  pace: {
    get name() { return t('Allure / vitesse actuelle'); },
    get: ({ rec }) => withEffort((name) => t('{name} actuelle', { name }), rec.sport, currentPace(rec)),
  },
  avg: {
    get name() { return t('Allure / vitesse moyenne'); },
    get: ({ rec, time }) => withEffort((name) => t('{name} moy.', { name }), rec.sport, sPerKm(time, rec.distance)),
  },
  speed: { get name() { return t('Vitesse'); }, get: ({ rec }) => ({ label: t('Vitesse'), value: fmtSpeed(currentPace(rec)), unit: speedUnit() }) },
  lap: {
    get name() { return t('Temps du tour'); },
    get: ({ rec, now }) => { const l = lapStatus(rec, now); return { label: t('Tour {n}', { n: l.n }), value: fmtDuration(l.time) }; },
  },
  lapPace: {
    get name() { return t('Allure / vitesse du tour'); },
    get: ({ rec, now }) => {
      const l = lapStatus(rec, now);
      return withEffort((name) => t('{name} du tour', { name }), rec.sport, sPerKm(l.time, rec.distance - (rec.laps?.at(-1)?.dist ?? 0)));
    },
  },
  hr: { get name() { return t('Fréquence cardiaque'); }, get: ({ bpm }) => ({ label: t('Cardio'), value: bpm ?? '—', unit: 'bpm' }) },
  zone: {
    get name() { return t('Zone cardiaque'); },
    get: ({ bpm, maxHr }) => {
      if (bpm == null) return { label: t('Zone FC'), value: '—' };
      const [value, unit] = ZONES[zoneOf(bpm, maxHr)].label.split(' ');
      return { label: t('Zone FC'), value, unit };
    },
  },
  ele: {
    get name() { return t('Altitude'); },
    get: ({ rec }) => ({ label: t('Altitude'), value: rec.pos?.ele != null ? fmtElev(rec.pos.ele) : '—', unit: elevUnit() }),
  },
  gain: { get name() { return t('Dénivelé positif'); }, get: ({ rec }) => ({ label: t('Dénivelé'), value: fmtElev(liveGain(rec.points)), unit: elevUnit() }) },
  clock: {
    get name() { return t('Heure'); },
    get: ({ now }) => ({ label: t('Heure'), value: new Date(now).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }),
  },
};

/** Elevation gain in meters so far, on smoothed altitudes like the saved activity. */
export function liveGain(points) {
  const ele = smoothEle(points);
  let gain = 0;
  for (let i = 1; ele && i < ele.length; i++) if (ele[i] > ele[i - 1]) gain += ele[i] - ele[i - 1];
  return gain;
}

export const DEFAULT_LAYOUT = { map: true, hero: 'time', fields: ['distance', 'pace', 'avg', 'hr'] };

/**
 * Record screen layout for a sport from the saved prefs ({ [sport]: layout }), with unknown
 * or duplicate fields dropped and the defaults filling what is missing.
 */
export function layoutFor(saved, sport) {
  const l = saved?.[sport] ?? {};
  const hero = FIELDS[l.hero] ? l.hero : DEFAULT_LAYOUT.hero;
  const fields = (Array.isArray(l.fields) ? [...new Set(l.fields)] : DEFAULT_LAYOUT.fields).filter((f) => FIELDS[f] && f !== hero);
  return { map: l.map ?? DEFAULT_LAYOUT.map, hero, fields };
}
