// Challenges with friends, without accounts: a challenge travels as a link (or its bare
// code) carrying its rules and every participant's result. Each athlete measures their own
// activities locally, adds their entry and shares the link back (see DECISIONS.md).
// Challenge: { id, title, metric (a goals.js METRICS key), sport ('' = all), from, to (ms,
// end exclusive), entries: [{ id, name, value (SI), at }], me (own entry id, never shared) }.

import { METRICS } from './goals.js';
import { SPORTS } from './sports.js';
import { totals } from './stats.js';

const MAX_ENTRIES = 50;

/** The local athlete's result: the challenge metric summed over its dates and sport. */
export const myValue = (ch, metas) => totals(metas, { from: ch.from, to: ch.to, sport: ch.sport || undefined })[ch.metric];

/** Standings with the local athlete's live value, best first: [{ id, name, value, me }]. */
export const standings = (ch, metas, name) =>
  [...ch.entries.filter((e) => e.id !== ch.me), { id: ch.me, name, value: myValue(ch, metas), me: true }].sort((a, b) => b.value - a.value);

/** Union of two entry lists by athlete, the most recent result winning. */
export function mergeEntries(a, b) {
  const by = new Map();
  for (const e of [...a, ...b]) if (!(by.get(e.id)?.at >= e.at)) by.set(e.id, e);
  return [...by.values()];
}

/** The challenge list after receiving a copy: joined with entry id `newMe`, or its entries merged. */
export function receive(list, incoming, newMe) {
  const known = list.find((c) => c.id === incoming.id);
  if (!known) return [...list, { ...incoming, me: newMe }];
  return list.map((c) => (c === known ? { ...c, entries: mergeEntries(c.entries, incoming.entries) } : c));
}

/** URL-safe code of the challenge, with the local athlete's current result in it. */
export function encode(ch, metas, name, now = Date.now()) {
  const { me, ...rules } = ch;
  const entries = mergeEntries(ch.entries, [{ id: me, name, value: myValue(ch, metas), at: now }]).slice(-MAX_ENTRIES);
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, ...rules, entries }));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Challenge from a pasted link or code, or null when it isn't a valid one (untrusted input). */
export function decode(text) {
  const code = String(text).match(/challenge\/([\w-]+)/)?.[1] ?? String(text).trim().split(/\s+/).pop(); // a link, or a message ending with the code
  let c;
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    c = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (x) => x.charCodeAt(0))));
  } catch {
    return null;
  }
  const str = (s, n) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  const valid = c?.v === 1 && str(c.id, 64) && Object.hasOwn(METRICS, c.metric) && (!c.sport || Object.hasOwn(SPORTS, c.sport))
    && num(c.from) && num(c.to) && c.to > c.from && Array.isArray(c.entries);
  if (!valid) return null;
  const entries = c.entries
    .filter((e) => str(e?.id, 64) && num(e.value) && e.value >= 0 && num(e.at))
    .slice(0, MAX_ENTRIES)
    .map((e) => ({ id: str(e.id, 64), name: str(e.name, 40) ?? '?', value: e.value, at: e.at }));
  return { id: str(c.id, 64), title: str(c.title, 60) ?? '', metric: c.metric, sport: c.sport || '', from: c.from, to: c.to, entries };
}
