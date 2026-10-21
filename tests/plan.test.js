import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trainingPaces } from '../src/lib/paces.js';
import { defaultRaceDate, estimate, GOALS, generatePlan, isHard, nextSession, planDefaults, planPhases, planWeeks, qualityDays, sessionsOn, weekOf, weeklyVolumes } from '../src/lib/plan.js';

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
