import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trainingPaces } from '../src/lib/paces.js';
import { changeDays, compliance, defaultRaceDate, estimate, GOALS, generatePlan, hardNextTo, isHard, makeUp, makeUpSlot, matchSessions, moveSession, nextSession, planDefaults, planPhases, planWeeks, qualityDays, sessionState, sessionsOn, weekDays, weekOf, weeklyVolumes } from '../src/lib/plan.js';

const DAY = 86400e3;
const START = new Date(2026, 10, 2).getTime(); // a Monday
const inputs = (goal, patch = {}) => ({
  goal, start: START, raceDate: defaultRaceDate(goal, START, 0), vdot: 45, weekly: 25000,
  runs: 4, days: [0, 2, 4, 6], longDay: 0, experience: 'intermediate', ...patch,
});
const CASES = [
  inputs('5k', { runs: 3, days: [0, 2, 4], experience: 'beginner', weekly: 0 }),
  inputs('10k'),
  inputs('half', { runs: 6, days: [0, 1, 2, 3, 4, 5], experience: 'advanced', weekly: 50000 }),
  inputs('marathon', { runs: 5, days: [0, 1, 3, 4, 6] }),
  inputs('marathon', { runs: 2, days: [0, 3], experience: 'beginner', raceDate: START + 9 * 7 * DAY + 2 * DAY }), // short, race on a Wednesday
];

test('planWeeks counts the race week; defaultRaceDate falls on the long-run day', () => {
  for (const goal of Object.keys(GOALS)) {
    const race = defaultRaceDate(goal, START, 0);
    assert.equal(new Date(race).getDay(), 0);
    assert.equal(planWeeks({ start: START, raceDate: race }), GOALS[goal].weeks[1]);
  }
  assert.equal(planWeeks({ start: START, raceDate: START }), 1);
  assert.equal(planWeeks({ start: START, raceDate: START + 7 * DAY }), 2);
});

test('planPhases: base, build, peak in order, taper last', () => {
  const p = planPhases(16, 3);
  assert.equal(p.length, 16);
  assert.deepEqual([...new Set(p)], ['base', 'build', 'peak', 'taper']);
  assert.deepEqual(p.slice(-3), ['taper', 'taper', 'taper']);
  assert.deepEqual(planPhases(2, 1), ['peak', 'taper']);
});

test('weeklyVolumes: +10 % at most over the last full week, lighter weeks, peak cap, taper', () => {
  for (const inp of CASES) {
    const weeks = planWeeks(inp);
    const v = weeklyVolumes(inp, weeks);
    const g = GOALS[inp.goal];
    let last = Math.max(inp.weekly, inp.runs * 4000);
    for (const [i, w] of v.entries()) {
      if (w.kind === 'build') {
        assert.ok(w.volume <= last * 1.1 + 1, `${inp.goal} week ${i + 1}: ${w.volume} after ${last}`);
        last = w.volume;
      } else assert.ok(w.volume < last, `${inp.goal} week ${i + 1} is lighter`);
      assert.ok(w.volume <= Math.max(g.peak[2], inp.weekly), 'peak cap');
    }
    assert.deepEqual(v.slice(-g.taper).map((w) => w.kind), Array(g.taper).fill('taper'));
    const every = inp.experience === 'beginner' ? 3 : 4;
    if (weeks > every + g.taper) assert.equal(v[every - 1].kind, 'recovery');
  }
});

test('qualityDays keeps hard days apart, around the week', () => {
  assert.deepEqual(qualityDays([0, 2, 4, 6], 0, 2), [4, 2]); // Thu first (farthest from Sunday), then Tue
  assert.deepEqual(qualityDays([0, 1, 6], 0, 1), []); // only the days next to Sunday
  assert.deepEqual(qualityDays([0, 3], 0, 2), [3]);
});

test('generated plans keep the hard limits', () => {
  for (const inp of CASES) {
    const plan = generatePlan(inp, 1);
    const g = GOALS[inp.goal];
    const what = `${inp.goal} ${inp.experience} ${inp.runs} runs`;
    const race = plan.sessions.at(-1);
    assert.equal(race.type, 'race', what);
    assert.equal(race.date, inp.raceDate, what);
    assert.equal(plan.sessions.filter((s) => s.type === 'race').length, 1);
    // No two hard days in a row, across weeks too.
    const hard = plan.sessions.filter((s) => isHard(s.type)).map((s) => s.date);
    hard.forEach((d, i) => i && assert.ok(Math.round((d - hard[i - 1]) / DAY) >= 2, `${what}: back-to-back hard days on ${new Date(d)}`));
    // One session a day at most, on the chosen days (the race excepted).
    assert.equal(new Set(plan.sessions.map((s) => s.date)).size, plan.sessions.length, what);
    for (const s of plan.sessions) if (s.type !== 'race') assert.ok(inp.days.includes(new Date(s.date).getDay()), what);
    // Long runs: capped, never shorter than an easy run of the same week.
    for (const s of plan.sessions.filter((x) => x.type === 'long')) {
      assert.ok(s.distance <= g.longCap, `${what}: long run ${s.distance}`);
      const easy = plan.sessions.filter((x) => x.week === s.week && x.type === 'easy');
      assert.ok(easy.every((e) => e.steps[0].value < s.distance), `${what}: easy run as long as the long run, week ${s.week}`); // strides aside
    }
    // Mostly easy: quality work steps stay a small share of the planned running time.
    const total = plan.sessions.reduce((n, s) => n + s.duration, 0);
    const paces = trainingPaces(inp.vdot);
    const hardTime = plan.sessions.flatMap((s) => (s.type === 'race' ? [] : s.steps)).filter((st) => st.kind === 'work' && st.target?.pace && st.target.pace !== 'easy')
      .reduce((n, st) => n + estimate([st], paces).duration, 0);
    // ~80/20 from 3 runs a week; with 2, one of them is the quality session.
    assert.ok(hardTime / total < (inp.runs >= 3 ? 0.2 : 0.3), `${what}: ${Math.round((hardTime / total) * 100)} % hard`);
    // Deterministic.
    assert.deepEqual(generatePlan(inp, 1), plan);
  }
});

test('plan lookups: week, sessions of a day, next session', () => {
  const plan = generatePlan(CASES[1], 1);
  assert.equal(weekOf(plan, START), 1);
  assert.equal(weekOf(plan, START + 7 * DAY + 3600e3), 2);
  assert.equal(weekOf(plan, START - DAY), 0);
  const wd = weekDays(plan, 2);
  assert.equal(wd.length, 7);
  assert.ok(wd.every((d, i) => weekOf(plan, d) === 2 && new Date(d).getDay() === (i + 1) % 7 && new Date(d).getHours() === 0));
  const first = plan.sessions[0];
  assert.deepEqual(sessionsOn(plan, first.date + 5 * 3600e3), [first]);
  assert.equal(nextSession(plan, START - 10 * DAY), first);
  assert.equal(nextSession(plan, plan.goal.date + DAY), null);
});

test('planDefaults reads volume, days and fitness from history', () => {
  const now = new Date(2026, 9, 21, 12).getTime(); // a Wednesday
  const runs = [];
  for (let w = 1; w <= 10; w++) {
    for (const [dow, km] of [[2, 8], [4, 8], [6, 14]]) { // Tue, Thu, Sat
      const d = new Date(2026, 9, 21 - 7 * w + (dow - 3), 8).getTime();
      runs.push({ sport: 'run', date: d, distance: km * 1000, movingTime: km * 330 });
    }
  }
  const d = planDefaults(runs, now);
  assert.equal(d.weekly, 30000);
  assert.deepEqual(d.days, [0, 4, 6]); // Sunday kept for the long run, then the busiest days of the last 8 weeks (the oldest Tuesday is out)
  assert.equal(d.experience, 'intermediate');
  assert.ok(d.vdot > 30 && d.vdot < 60);
  assert.equal(new Date(d.start).getDay(), 1);
  assert.ok(d.start > now && d.start - now < 7 * DAY);
  const empty = planDefaults([], now);
  assert.equal(empty.vdot, null);
  assert.equal(empty.experience, 'beginner');
  assert.deepEqual(empty.days, [0, 2, 4]);
});

const run = (id, date, s, k = 1) => ({ id, sport: 'run', date, distance: s.distance * k, movingTime: s.duration * k });

test('compliance: done within ±20 % of distance or duration', () => {
  const s = { distance: 10000, duration: 3000 };
  assert.equal(compliance(s, { distance: 8500, movingTime: 2000 }).done, true);
  assert.equal(compliance(s, { distance: 7000, movingTime: 2000 }).done, false);
  assert.equal(compliance(s, { distance: 7000, movingTime: 2900 }).done, true); // by time
  assert.equal(compliance(s, {}).ratio, 0);
});

test('matchSessions: same day first, else ±1 day, by closest duration; links by hand win', () => {
  const plan = generatePlan(CASES[1], 1); // runs Sun, Tue, Thu, Sat
  const [a, b] = plan.sessions; // week 1: Tuesday, Thursday
  const ride = { id: 'ride', sport: 'ride', date: a.date + 8 * 3600e3, distance: a.distance, movingTime: a.duration };
  let m = matchSessions(plan, [run('r1', a.date + 8 * 3600e3, a), ride]);
  assert.equal(m.get(a.id).id, 'r1');
  assert.equal(m.size, 1);
  // Run a day late, on Wednesday: goes to Tuesday's session (same distance), not Thursday's.
  m = matchSessions(plan, [run('r2', a.date + DAY + 8 * 3600e3, a)]);
  assert.equal(m.get(a.id)?.id, 'r2');
  // A run the same day wins over one the day after.
  m = matchSessions(plan, [run('late', a.date + DAY + 3600e3, a), run('on', a.date + 3600e3, a, 0.5)]);
  assert.equal(m.get(a.id).id, 'on');
  assert.equal(m.get(b.id)?.id, 'late'); // ±1 day, Wednesday for Thursday
  // Unlinked by hand: never matched; linked by hand: matched whatever the date.
  const hand = { ...plan, sessions: plan.sessions.map((s) => (s === a ? { ...s, activity: null } : s === b ? { ...s, activity: 'far' } : s)) };
  m = matchSessions(hand, [run('on', a.date + 3600e3, a), run('far', a.date - 20 * DAY, b)]);
  assert.equal(m.has(a.id), false);
  assert.equal(m.get(b.id).id, 'far');
  assert.equal([...m.values()].filter((x) => x.id === 'on').length, 0); // Tuesday's run is not pushed to another session
});

test('sessionState', () => {
  const s = { date: START, distance: 10000, duration: 3000 };
  assert.equal(sessionState(s, { distance: 10000 }, START), 'done');
  assert.equal(sessionState(s, { distance: 5000 }, START), 'partial');
  assert.equal(sessionState({ ...s, status: 'skipped' }, null, START + DAY), 'skipped');
  assert.equal(sessionState(s, null, START + DAY), 'missed');
  assert.equal(sessionState(s, null, START + 3600e3), 'planned');
});

test('moveSession swaps with the session already on that day', () => {
  const plan = generatePlan(CASES[1], 1);
  const [a, b] = plan.sessions;
  const moved = moveSession(plan, a.id, b.date);
  assert.equal(moved.sessions.find((s) => s.id === a.id).date, b.date);
  assert.equal(moved.sessions.find((s) => s.id === b.id).date, a.date);
  const free = moveSession(plan, a.id, a.date + DAY); // Wednesday: no session there
  assert.equal(free.sessions.find((s) => s.id === a.id).date, a.date + DAY);
  assert.deepEqual(free.sessions.map((s) => s.date), [...free.sessions.map((s) => s.date)].sort((x, y) => x - y));
});

test('makeUp: a missed key session replaces a later easy run of its week, once, never next to a hard day', () => {
  const inp = inputs('10k', { runs: 4, days: [0, 2, 3, 5], experience: 'beginner' }); // Wed key, Tue + Fri easy
  const plan = generatePlan(inp, 1);
  const w1 = plan.sessions.filter((s) => s.week === 1);
  const key = w1.find((s) => isHard(s.type) && s.type !== 'long');
  const after = key.date + DAY;
  const slot = makeUpSlot(plan, key.id, after);
  assert.ok(slot, 'an easy run is free');
  assert.equal(slot.type, 'easy');
  assert.ok(slot.date >= after);
  const done = makeUp(plan, key.id, slot);
  const moved = done.sessions.find((s) => s.id === slot.id);
  assert.equal(moved.type, key.type);
  assert.equal(moved.from, key.id);
  assert.equal(done.sessions.find((s) => s.id === key.id).status, 'moved');
  assert.equal(hardNextTo(done, moved.date, moved), false);
  assert.equal(makeUpSlot(done, key.id, after), null); // once
  assert.equal(makeUpSlot(done, moved.id, moved.date + DAY), null); // a make-up is not made up again
  assert.equal(makeUpSlot(plan, w1.find((s) => s.type === 'easy').id, after), null); // easy runs are just missed
});

test('changeDays regenerates the weeks after the current one, same volumes', () => {
  const plan = generatePlan(CASES[1], 1);
  const now = START + 7 * DAY + 3600e3; // week 2
  const next = changeDays(plan, [1, 3, 6], 6, now);
  assert.deepEqual(next.sessions.filter((s) => s.week <= 2), plan.sessions.filter((s) => s.week <= 2));
  for (const s of next.sessions.filter((x) => x.week > 2 && x.type !== 'race')) assert.ok([1, 3, 6].includes(new Date(s.date).getDay()));
  assert.equal(next.sessions.filter((s) => s.week === 3 && s.type === 'long')[0] && new Date(next.sessions.find((s) => s.week === 3 && s.type === 'long').date).getDay(), 6);
  assert.deepEqual(next.weeks.map((w) => w.volume), plan.weeks.map((w) => w.volume));
  assert.equal(new Set(next.sessions.map((s) => s.id)).size, next.sessions.length);
  assert.equal(next.sessions.at(-1).type, 'race');
});

test('nextSession skips sessions done or skipped', () => {
  const plan = generatePlan(CASES[1], 1);
  const [a, b] = plan.sessions;
  assert.equal(nextSession(plan, a.date, new Map([[a.id, {}]])), b);
  assert.equal(nextSession({ ...plan, sessions: [{ ...a, status: 'skipped' }, b] }, a.date), b);
});
