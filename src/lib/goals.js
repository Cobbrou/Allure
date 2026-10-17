// Custom goals: a target per sport, metric and period, measured against activity metas.
// Goal: { id, sport ('' = all sports), metric, period: 'week' | 'month' | 'year', target (SI) }.

import { distLen, distUnit, elevLen, elevUnit } from './format.js';
import { t, tn } from './i18n.js';
import { SPORTS } from './sports.js';
import { periodStart, totals } from './stats.js';

// unit: what the athlete types; scale converts it to SI (km or mi -> m, h -> s); dec: decimals
// shown. Distance and elevation follow the display unit system (getters).
export const METRICS = {
  distance: { get label() { return t('Distance'); }, get unit() { return distUnit(); }, get scale() { return distLen(); }, dec: 1 },
  movingTime: { get label() { return t('Temps'); }, unit: 'h', scale: 3600, dec: 1 },
  gain: { get label() { return t('Dénivelé'); }, get unit() { return elevUnit(); }, get scale() { return elevLen(); }, dec: 0 },
  count: { get label() { return t('Activités'); }, unit: '', scale: 1, dec: 0 },
};

export const GOAL_PERIODS = {
  get week() { return t('Cette semaine'); },
  get month() { return t('Ce mois'); },
  get year() { return t('Cette année'); },
};

/** SI value in the athlete's unit, e.g. ('distance', 12345) -> "12.3", ('distance', 30000) -> "30". */
export function fmtGoalValue(metric, v) {
  const { scale, dec } = METRICS[metric];
  const x = v / scale;
  return x.toFixed(Math.abs(x - Math.round(x)) < 0.01 ? 0 : dec); // targets typed in miles are stored rounded to the meter
}

/** "30 km · Course · Cette semaine" */
export function goalLabel(g) {
  const { unit } = METRICS[g.metric];
  const v = fmtGoalValue(g.metric, g.target);
  const target = unit ? `${v} ${unit}` : tn(g.target, '{n} activité', '{n} activités', { n: v });
  return [target, g.sport ? SPORTS[g.sport].label : t('Tous sports'), GOAL_PERIODS[g.period]].join(' · ');
}

/** Progress of one goal in the current period: { value, target, ratio (0..1), done }. */
export function goalProgress(goal, metas, now = Date.now()) {
  const value = totals(metas, { from: periodStart(goal.period, now), sport: goal.sport || undefined })[goal.metric];
  return { value, target: goal.target, ratio: Math.min(1, value / goal.target), done: value >= goal.target };
}

/** Goals reached by going from the `before` activity list to `after` (e.g. after a save). */
export function newlyReached(goals, before, after, now = Date.now()) {
  return goals.filter((g) => !goalProgress(g, before, now).done && goalProgress(g, after, now).done);
}
