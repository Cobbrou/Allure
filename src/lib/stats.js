// Aggregations over activity metas for the profile dashboard. Local time, weeks start Monday.

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(t) {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
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

/** Month grid, Monday first: array of weeks, each 7 day-start timestamps or null for padding. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array((first.getDay() + 6) % 7).fill(null);
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

