// Custom goals: a target per sport, metric and period, measured against activity metas.
// Goal: { id, sport ('' = all sports), metric, period: 'week' | 'month' | 'year', target (SI) }.

import { SPORTS } from './sports.js';
import { periodStart, totals } from './stats.js';

// unit: what the athlete types; scale converts it to SI (km -> m, h -> s); dec: decimals shown.
export const METRICS = {
  distance: { label: 'Distance', unit: 'km', scale: 1000, dec: 1 },
  movingTime: { label: 'Temps', unit: 'h', scale: 3600, dec: 1 },
  gain: { label: 'Dénivelé', unit: 'm', scale: 1, dec: 0 },
  count: { label: 'Activités', unit: '', scale: 1, dec: 0 },
};

export const GOAL_PERIODS = { week: 'Cette semaine', month: 'Ce mois', year: 'Cette année' };

/** SI value in the athlete's unit, e.g. ('distance', 12345) -> "12.3", ('distance', 30000) -> "30". */
export function fmtGoalValue(metric, v) {
  const { scale, dec } = METRICS[metric];
  return (v / scale).toFixed(v % scale ? dec : 0);
}

/** "30 km · Course · Cette semaine" */
export function goalLabel(g) {
  const { unit } = METRICS[g.metric];
  const target = `${fmtGoalValue(g.metric, g.target)} ${unit || (g.target > 1 ? 'activités' : 'activité')}`;
  return [target, g.sport ? SPORTS[g.sport].label : 'Tous sports', GOAL_PERIODS[g.period]].join(' · ');
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
