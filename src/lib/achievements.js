// Achievements ("Succès"): permanent badges, unlike the monthly challenges. Derived from the
// activity metas alone, so they apply retroactively to the whole history. Local time.

import { t } from './i18n.js';
import { startOfDay, startOfWeek } from './stats.js';

// metric: count | distance | gain (sums), longest (one activity's distance), streakDays,
// streakWeeks (longest run of consecutive active days / weeks), sports (distinct sports),
// dawn (activities started before 6:00), night (started from 21:00).
// sports: activity sports that count (all when absent). Targets are SI.
export const ACHIEVEMENTS = [
  { id: 'first', icon: '👟', get title() { return t('Premier pas'); }, get text() { return t('Termine ta première activité'); }, metric: 'count', target: 1 },
  { id: 'count-50', icon: '🎯', get title() { return t('Cinquante'); }, get text() { return t('Termine 50 activités'); }, metric: 'count', target: 50 },
  { id: 'dist-100', icon: '🥉', get title() { return t('100 km'); }, get text() { return t('Cumule 100 km, tous sports'); }, metric: 'distance', target: 100e3 },
  { id: 'dist-1000', icon: '🥈', get title() { return t('1 000 km'); }, get text() { return t('Cumule 1 000 km, tous sports'); }, metric: 'distance', target: 1000e3 },
  { id: 'dist-5000', icon: '🥇', get title() { return t('5 000 km'); }, get text() { return t('Cumule 5 000 km, tous sports'); }, metric: 'distance', target: 5000e3 },
  { id: 'everest', icon: '🏔️', get title() { return t('Everest'); }, get text() { return t('Cumule 8 849 m de dénivelé'); }, metric: 'gain', target: 8849 },
  { id: 'half', icon: '🏅', get title() { return t('Semi-marathon'); }, get text() { return t("Cours 21,1 km d'une traite"); }, sports: ['run'], metric: 'longest', target: 21097.5 },
  { id: 'marathon', icon: '🏆', get title() { return t('Marathonien'); }, get text() { return t("Cours 42,2 km d'une traite"); }, sports: ['run'], metric: 'longest', target: 42195 },
  { id: 'century', icon: '🚴', get title() { return t('Century'); }, get text() { return t('Une sortie vélo de 160 km'); }, sports: ['ride'], metric: 'longest', target: 160934 },
  { id: 'streak-7', icon: '🔥', get title() { return t('Semaine parfaite'); }, get text() { return t('Sois actif 7 jours de suite'); }, metric: 'streakDays', target: 7 },
  { id: 'weeks-12', icon: '📆', get title() { return t('Régulier'); }, get text() { return t('Au moins une activité par semaine, 12 semaines de suite'); }, metric: 'streakWeeks', target: 12 },
  { id: 'sports-3', icon: '🧭', get title() { return t('Touche-à-tout'); }, get text() { return t('Pratique 3 sports différents'); }, metric: 'sports', target: 3 },
  { id: 'dawn', icon: '🌅', get title() { return t('Lève-tôt'); }, get text() { return t('Pars avant 6 h du matin'); }, metric: 'dawn', target: 1 },
  { id: 'night', icon: '🌙', get title() { return t('Oiseau de nuit'); }, get text() { return t('Pars à 21 h ou plus tard'); }, metric: 'night', target: 1 },
];

/** The day (or week) start right after `start`, DST-safe. */
const next = (start, days) => {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d.getTime();
};

/** Progress of an achievement over a whole history: { value, ratio (0..1), done, doneAt }. */
export function achievementProgress(ach, metas) {
  const list = metas.filter((a) => !ach.sports || ach.sports.includes(a.sport)).sort((a, b) => a.date - b.date);
  const streak = ach.metric === 'streakDays' ? [startOfDay, 1] : ach.metric === 'streakWeeks' ? [startOfWeek, 7] : null;
  const seen = new Set();
  let value = 0, doneAt = null, run = 0, last = null;
  for (const a of list) {
    const hour = new Date(a.date).getHours();
    if (streak) {
      const unit = streak[0](a.date);
      if (unit !== last) run = last != null && unit === next(last, streak[1]) ? run + 1 : 1;
      last = unit;
      value = Math.max(value, run);
    } else if (ach.metric === 'count') value++;
    else if (ach.metric === 'longest') value = Math.max(value, a.distance);
    else if (ach.metric === 'sports') value = seen.add(a.sport).size;
    else if (ach.metric === 'dawn') value += hour < 6 ? 1 : 0;
    else if (ach.metric === 'night') value += hour >= 21 ? 1 : 0;
    else value += a[ach.metric] ?? 0;
    if (doneAt == null && value >= ach.target) doneAt = a.date;
  }
  return { value, ratio: Math.min(1, value / ach.target), done: doneAt != null, doneAt };
}

/** Every achievement with its progress: unlocked first (newest first), then locked, closest first. */
export function achievements(metas) {
  return ACHIEVEMENTS.map((ach) => ({ ...ach, ...achievementProgress(ach, metas) }))
    .sort((a, b) => (b.done - a.done) || (a.done ? b.doneAt - a.doneAt : b.ratio - a.ratio));
}

/** Achievements unlocked by going from the `before` activity list to `after`. */
export function newlyUnlocked(before, after) {
  const had = new Set(achievements(before).filter((a) => a.done).map((a) => a.id));
  return achievements(after).filter((a) => a.done && !had.has(a.id));
}
