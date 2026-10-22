// Aggregations over activity metas for the profile dashboard. Local time.

import { locale } from './i18n.js';

// First day of the week: 1 = Monday (default), 0 = Sunday. Like the units in format.js,
// App sets it before rendering and remounts the tree on change.
let weekStart = 1;
export const setWeekStart = (day) => { weekStart = day === 0 ? 0 : 1; };
const dayIndex = (d) => (d.getDay() + 7 - weekStart) % 7; // 0 = first day of the week

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(t) {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - dayIndex(d));
  return d.getTime();
}

/** Start timestamp of the current 'week' | 'month' | 'year' | 'all' period. */
export function periodStart(period, now = Date.now()) {
  const d = new Date(now);
  if (period === 'week') return startOfWeek(now);
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (period === 'year') return new Date(d.getFullYear(), 0, 1).getTime();
  return -Infinity;
}

const matches = (a, sport) => !sport || a.sport === sport;

/** Sum of count, distance (m), moving time (s) and gain (m) for activities in [from, to). */
export function totals(metas, { from = -Infinity, to = Infinity, sport } = {}) {
  const t = { count: 0, distance: 0, movingTime: 0, gain: 0 };
  for (const a of metas) {
    if (a.date < from || a.date >= to || !matches(a, sport)) continue;
    t.count++;
    t.distance += a.distance;
    t.movingTime += a.movingTime ?? 0;
    t.gain += a.gain ?? 0;
  }
  return t;
}

/** This year's totals up to now, and last year's up to the same date and time: { current, last }. */
export function yearToDate(metas, now = Date.now(), sport) {
  const y = new Date(now).getFullYear();
  const then = new Date(now);
  then.setFullYear(y - 1); // 29 Feb -> 1 Mar
  return {
    current: totals(metas, { from: new Date(y, 0, 1).getTime(), to: now + 1, sport }),
    last: totals(metas, { from: new Date(y - 1, 0, 1).getTime(), to: then.getTime() + 1, sport }),
  };
}

/** Distance per week for the last `weeks` weeks, oldest first: [{ start, distance }]. */
export function weeklyDistance(metas, now = Date.now(), weeks = 12, sport) {
  const out = [];
  let start = startOfWeek(now);
  for (let i = 0; i < weeks; i++) {
    const next = new Date(start);
    next.setDate(next.getDate() + 7);
    out.unshift({ start, distance: totals(metas, { from: start, to: next.getTime(), sport }).distance });
    const prev = new Date(start);
    prev.setDate(prev.getDate() - 7);
    start = prev.getTime();
  }
  return out;
}

/** Month grid, first day of the week first: array of weeks, each 7 day-start timestamps or null for padding. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(dayIndex(first)).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d).getTime());
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** Activities grouped by local day start: Map<dayStart, meta[]>. */
export function byDay(metas, sport) {
  const map = new Map();
  for (const a of metas) {
    if (!matches(a, sport)) continue;
    const k = startOfDay(a.date);
    map.set(k, [...(map.get(k) ?? []), a]);
  }
  return map;
}

/**
 * Training log rows, newest week first: [{ start, days, totals }], where `days` holds the
 * 7 day lists of activities (first day of the week first) and `totals` the week's totals().
 */
export function trainingWeeks(metas, weeks, now = Date.now(), sport) {
  const days = byDay(metas, sport);
  const out = [];
  let start = startOfWeek(now);
  for (let i = 0; i < weeks; i++) {
    // setDate keeps local midnight across DST changes, unlike adding 86400e3.
    const day = (k) => { const d = new Date(start); d.setDate(d.getDate() + k); return d.getTime(); };
    out.push({
      start,
      days: Array.from({ length: 7 }, (_, k) => days.get(day(k)) ?? []),
      totals: totals(metas, { from: start, to: day(7), sport }),
    });
    start = day(-7);
  }
  return out;
}

/** Weekday initials from the first day of the week ("L M M J V S D" / "S M T W T F S"); 2026-01-04 is a Sunday. */
export const weekdayInitials = () =>
  Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + weekStart + i).toLocaleDateString(locale(), { weekday: 'narrow' }));

/** Start of the week `n` weeks after the one starting at `start` (DST-proof). */
const addWeeks = (start, n) => { const d = new Date(start); d.setDate(d.getDate() + 7 * n); return d.getTime(); };

/**
 * Weekly streak: weeks in a row with at least one activity, up to this week (a week without
 * one yet doesn't break it until it is over), and the longest ever. { current, best }.
 */
export function weekStreak(metas, now = Date.now()) {
  const weeks = new Set(metas.filter((a) => a.date <= now).map((a) => startOfWeek(a.date)));
  let w = startOfWeek(now);
  if (!weeks.has(w)) w = addWeeks(w, -1);
  let current = 0;
  for (; weeks.has(w); w = addWeeks(w, -1)) current++;
  let best = 0;
  for (const s of weeks) {
    if (weeks.has(addWeeks(s, -1))) continue; // not the first week of a run
    let n = 0;
    for (let x = s; weeks.has(x); x = addWeeks(x, 1)) n++;
    best = Math.max(best, n);
  }
  return { current, best };
}

/**
 * A calendar year in sport: totals, active days, the busiest month (by moving time), the
 * longest activity and totals per sport (most time first).
 */
export function yearRecap(metas, year) {
  const list = metas.filter((a) => new Date(a.date).getFullYear() === year);
  const months = Array(12).fill(0), sports = new Map();
  for (const a of list) {
    months[new Date(a.date).getMonth()] += a.movingTime ?? 0;
    const s = sports.get(a.sport) ?? { sport: a.sport, count: 0, distance: 0, movingTime: 0 };
    s.count++; s.distance += a.distance; s.movingTime += a.movingTime ?? 0;
    sports.set(a.sport, s);
  }
  return {
    year,
    ...totals(list),
    days: new Set(list.map((a) => startOfDay(a.date))).size,
    month: list.length ? months.indexOf(Math.max(...months)) : null,
    longest: list.reduce((b, a) => (!b || a.distance > b.distance ? a : b), null),
    sports: [...sports.values()].sort((a, b) => b.movingTime - a.movingTime),
  };
}

/**
 * Activities matching a search: q (in the name, description or notes, case and accents
 * ignored), sport, from / to (ms, to excluded), min / max distance (m).
 */
export function filterActivities(metas, { q = '', sport, from, to, min, max } = {}) {
  const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const words = fold(q).split(/\s+/).filter(Boolean);
  return metas.filter((a) => (!sport || a.sport === sport)
    && !(from != null && a.date < from) && !(to != null && a.date >= to)
    && !(min != null && a.distance < min) && !(max != null && a.distance > max)
    && words.every((w) => fold(`${a.name} ${a.description ?? ''} ${a.notes ?? ''}`).includes(w)));
}
