// Monthly challenges, Strava-style platform challenges derived from activity metas:
// every athlete takes part, and completing one within its calendar month earns its badge.
// Local time, like the rest of the stats.

import { t, tn } from './i18n.js';
import { startOfDay } from './stats.js';

// metric: distance | gain | movingTime (sums), longest (one activity's distance), days (active days).
// sports: activity sports that count (all when absent). Targets are SI.
export const CHALLENGES = [
  { id: 'run-5k', icon: '🏃', get title() { return t('Défi 5 km'); }, get text() { return t("Cours 5 km d'une traite"); }, sports: ['run'], metric: 'longest', target: 5000 },
  { id: 'run-100', icon: '💯', get title() { return t('100 km de course'); }, get text() { return t('Cumule 100 km en courant'); }, sports: ['run'], metric: 'distance', target: 100000 },
  { id: 'ride-fondo', icon: '🚴', get title() { return t('Gran Fondo'); }, get text() { return t('Une sortie vélo de 100 km'); }, sports: ['ride'], metric: 'longest', target: 100000 },
  { id: 'ride-400', icon: '🛞', get title() { return t('400 km à vélo'); }, get text() { return t('Cumule 400 km à vélo'); }, sports: ['ride'], metric: 'distance', target: 400000 },
  { id: 'hike-50', icon: '🥾', get title() { return t('Randonneur'); }, get text() { return t('Cumule 50 km de marche ou de rando'); }, sports: ['hike', 'walk'], metric: 'distance', target: 50000 },
  { id: 'climb-2000', icon: '⛰️', get title() { return t('Grimpeur'); }, get text() { return t('Cumule 2 000 m de dénivelé, tous sports'); }, metric: 'gain', target: 2000 },
  { id: 'time-20h', icon: '⏱️', get title() { return t('20 heures'); }, get text() { return t("Cumule 20 heures d'activité"); }, metric: 'movingTime', target: 20 * 3600 },
  { id: 'days-12', icon: '📅', get title() { return t('Régularité'); }, get text() { return t('Sois actif 12 jours dans le mois'); }, metric: 'days', target: 12 },
];

/** [from, to) timestamps of a calendar month (month 0..11). */
export const monthRange = (year, month) => [new Date(year, month, 1).getTime(), new Date(year, month + 1, 1).getTime()];

/**
 * Progress of a challenge in a month: { value, ratio (0..1), done, doneAt } where doneAt is
 * the date of the activity that reached the target.
 */
export function challengeProgress(ch, metas, year, month) {
  const [from, to] = monthRange(year, month);
  const list = metas.filter((a) => a.date >= from && a.date < to && (!ch.sports || ch.sports.includes(a.sport))).sort((a, b) => a.date - b.date);
  let value = 0, doneAt = null;
  const days = new Set();
  for (const a of list) {
    if (ch.metric === 'longest') value = Math.max(value, a.distance);
    else if (ch.metric === 'days') value = days.add(startOfDay(a.date)).size;
    else value += a[ch.metric] ?? 0;
    if (doneAt == null && value >= ch.target) doneAt = a.date;
  }
  return { value, ratio: Math.min(1, value / ch.target), done: doneAt != null, doneAt };
}

/** This month's challenges with their progress, and the days left in the month (today included). */
export function monthChallenges(metas, now = Date.now()) {
  const d = new Date(now), [, to] = monthRange(d.getFullYear(), d.getMonth());
  const daysLeft = Math.round((to - startOfDay(now)) / 86400000);
  return { daysLeft, list: CHALLENGES.map((ch) => ({ ...ch, ...challengeProgress(ch, metas, d.getFullYear(), d.getMonth()) })) };
}

/** Every badge earned since the first activity, newest first: [{ ...challenge, year, month, doneAt }]. */
export function badges(metas, now = Date.now()) {
  if (!metas.length) return [];
  const first = new Date(Math.min(...metas.map((a) => a.date))), end = new Date(now);
  const out = [];
  for (let y = first.getFullYear(), m = first.getMonth(); y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth()); m === 11 ? (y++, m = 0) : m++) {
    for (const ch of CHALLENGES) {
      const p = challengeProgress(ch, metas, y, m);
      if (p.done) out.push({ ...ch, year: y, month: m, doneAt: p.doneAt });
    }
  }
  return out.sort((a, b) => b.doneAt - a.doneAt);
}

/** This month's challenges completed by going from the `before` activity list to `after`. */
export function newlyCompleted(before, after, now = Date.now()) {
  const was = new Set(monthChallenges(before, now).list.filter((c) => c.done).map((c) => c.id));
  return monthChallenges(after, now).list.filter((c) => c.done && !was.has(c.id));
}

/** Challenge value in its unit: "12.3 km", "850 m", "4 h 30", "5 jours". */
export function fmtChallenge(metric, v) {
  if (metric === 'distance' || metric === 'longest') return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)} km`;
  if (metric === 'gain') return `${Math.round(v)} m`;
  if (metric === 'movingTime') {
    const h = Math.floor(v / 3600), min = Math.floor((v % 3600) / 60);
    return `${h} h ${String(min).padStart(2, '0')}`;
  }
  return tn(v, '{n} jour', '{n} jours');
}
