import { locale, t, tn } from '../lib/i18n.js';
import { useMemo, useState } from 'react';
import Segmented from '../components/Segmented.jsx';
import { distLen, distUnit, fmtDay, fmtDist, fmtDuration, parseNum } from '../lib/format.js';
import { raceTime, vdot as vdotOf } from '../lib/paces.js';
import { defaultRaceDate, EXPERIENCE, generatePlan, GOALS, PHASES, planDefaults, planWeeks } from '../lib/plan.js';
import { back, go } from '../router.js';

const DAY = 86400e3;
// <input type="date"> value <-> local midnight.
const toInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromInput = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const EXPERIENCE_LABELS = { get beginner() { return t('Débutant'); }, get intermediate() { return t('Intermédiaire'); }, get advanced() { return t('Confirmé'); } };
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // getDay values, Monday first
const dayName = (d) => new Date(2026, 0, 4 + d).toLocaleDateString(locale(), { weekday: 'long' }); // 2026-01-04 is a Sunday

/** `#/plan/new(/:goal)`: one question per screen, prefilled from history, ending on a preview. */
export default function PlanSetupPage({ activities, goal: goalParam, onCreate }) {
  const defaults = useMemo(() => activities && planDefaults(activities), [activities]);
  if (!defaults) return <main className="detail" aria-busy="true" />;
  return <Wizard defaults={defaults} goalParam={GOALS[goalParam] ? goalParam : null} onCreate={onCreate} />;
}

function Wizard({ defaults, goalParam, onCreate }) {
  const [goal, setGoal] = useState(goalParam ?? '10k');
  const [raceDate, setRaceDate] = useState(() => defaultRaceDate(goalParam ?? '10k', defaults.start, defaults.longDay));
  const [race, setRace] = useState(null); // { goal, h, min, sec } a race time typed in, when history gives no fitness or the athlete prefers it
  const [weekly, setWeekly] = useState(fmtDist(defaults.weekly, 0));
  const [experience, setExperience] = useState(defaults.experience);
  const [days, setDays] = useState(defaults.days);
  const [longDay, setLongDay] = useState(defaults.longDay);
  const screens = [...(goalParam ? [] : ['goal']), 'date', 'fitness', 'volume', 'days', 'preview'];
  const [i, setI] = useState(0);
  const screen = screens[i];

  const typed = race && (Number(race.h) || 0) * 3600 + (Number(race.min) || 0) * 60 + (Number(race.sec) || 0);
  const vdot = typed ? Math.round(vdotOf(GOALS[race.goal].m, typed) * 10) / 10 : defaults.vdot;
  const g = GOALS[goal];
  const minDate = defaults.start + (g.taper + 1) * 7 * DAY;
  const maxDate = defaults.start + 30 * 7 * DAY;
  const inputs = { goal, raceDate, start: defaults.start, vdot, weekly: Math.max(0, parseNum(weekly) || 0) * distLen(), runs: days.length, days, longDay, experience };
  const weeks = planWeeks(inputs);
  const plan = useMemo(() => (screen === 'preview' ? generatePlan(inputs) : null), [screen]); // inputs read when the preview opens

  const pickGoal = (id) => { setGoal(id); setRaceDate(defaultRaceDate(id, defaults.start, longDay)); };
  const toggleDay = (d) => {
    if (d === longDay) return; // the long-run day stays a run day
    setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  };
  const valid = {
    goal: true,
    date: raceDate >= minDate && raceDate <= maxDate,
    fitness: vdot > 20 && vdot < 90,
    volume: weekly !== '' && Number.isFinite(parseNum(weekly)),
    days: days.length >= 2 && days.length <= 6,
    preview: true,
  }[screen];
  const next = () => (i < screens.length - 1 ? setI(i + 1) : (onCreate(generatePlan(inputs, Date.now())), go('/', true)));

  return (
    <>
      <header className="topbar">
        <a className="back" href="#/" aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); if (i) setI(i - 1); else back('/'); }}>‹</a>
        <h1>{t('Nouveau plan')}</h1>
        <span className="muted small-label">{i + 1} / {screens.length}</span>
      </header>
      <main className="detail wizard">
        {screen === 'goal' && (
          <section className="card">
            <h2>{t('Quel est ton objectif ?')}</h2>
            <div className="pick-list">
              {Object.entries(GOALS).map(([id, x]) => (
                <button key={id} type="button" className={goal === id ? 'on' : ''} aria-pressed={goal === id} onClick={() => pickGoal(id)}>
                  <span>{x.label}</span><small>{t('{a} à {b} semaines', { a: x.weeks[0], b: x.weeks[2] })}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        {screen === 'date' && (
          <section className="card edit">
            <h2>{t('Quand est la course ?')}</h2>
            <label>{t('Date de la course')}
              <input type="date" value={toInput(raceDate)} min={toInput(minDate)} max={toInput(maxDate)} onChange={(e) => e.target.value && setRaceDate(fromInput(e.target.value))} />
            </label>
            <p className="muted">{t('Début le {day}', { day: fmtDay(defaults.start) })} · {tn(weeks, '{n} semaine', '{n} semaines')}</p>
            {valid && weeks < g.weeks[0] && <p className="record-status bad">{t('Plan court : {n} semaines au moins sont conseillées pour cet objectif.', { n: g.weeks[0] })}</p>}
            {!valid && <p className="record-status bad">{t('Choisis une date entre le {from} et le {to}.', { from: fmtDay(minDate), to: fmtDay(maxDate, 'numeric') })}</p>}
          </section>
        )}
        {screen === 'fitness' && (
          <section className="card edit">
            <h2>{t('Ton niveau actuel')}</h2>
            {defaults.fit && !race && (
              <p>{t('VDOT {vdot}, d’après ton {dist} en {time} le {day}.', { vdot: defaults.fit.vdot, dist: `${fmtDist(defaults.fit.distance, 1)} ${distUnit()}`, time: fmtDuration(defaults.fit.time), day: fmtDay(defaults.fit.activity.date) })}</p>
            )}
            {!defaults.fit && !race && <p className="muted">{t('Pas de course récente dans ton historique : indique un temps de course récent.')}</p>}
            {race ? (
              <>
                <label>{t('Distance')}
                  <select value={race.goal} onChange={(e) => setRace({ ...race, goal: e.target.value })}>
                    {Object.entries(GOALS).map(([id, x]) => <option key={id} value={id}>{x.label}</option>)}
                  </select>
                </label>
                <fieldset>
                  <legend>{t('Temps')}</legend>
                  <div className="duration-fields">
                    <label><input inputMode="numeric" value={race.h} onChange={(e) => setRace({ ...race, h: e.target.value })} placeholder="0" aria-label={t('Heures')} />h</label>
                    <label><input inputMode="numeric" value={race.min} onChange={(e) => setRace({ ...race, min: e.target.value })} placeholder="0" aria-label={t('Minutes')} />min</label>
                    <label><input inputMode="numeric" value={race.sec} onChange={(e) => setRace({ ...race, sec: e.target.value })} placeholder="0" aria-label={t('Secondes')} />s</label>
                  </div>
                </fieldset>
                {vdot > 20 && vdot < 90 && <p className="muted">{t('VDOT {vdot}', { vdot })}</p>}
                {defaults.fit && <button type="button" className="ghost" onClick={() => setRace(null)}>{t('Utiliser mon historique')}</button>}
              </>
            ) : (
              <button type="button" className="ghost" onClick={() => setRace({ goal: '10k', h: '', min: '', sec: '' })}>{t('Indiquer un temps de course')}</button>
            )}
          </section>
        )}
        {screen === 'volume' && (
          <section className="card edit">
            <h2>{t('Ton volume actuel')}</h2>
            <label>{t('Distance par semaine ({unit})', { unit: distUnit() })}
              <input inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
            </label>
            <p className="muted small-label">{t('Moyenne de tes 4 dernières semaines : {dist} {unit}.', { dist: fmtDist(defaults.weekly, 0), unit: distUnit() })}</p>
            <Segmented label={t('Expérience')} value={experience} onChange={setExperience}
              options={EXPERIENCE.map((id) => ({ id, label: EXPERIENCE_LABELS[id] }))} />
          </section>
        )}
        {screen === 'days' && (
          <section className="card edit">
            <h2>{t('Tes jours de course')}</h2>
            <div className="day-picks" role="group" aria-label={t('Jours de course')}>
              {WEEK.map((d) => (
                <button key={d} type="button" className={days.includes(d) ? 'on' : ''} aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}>
                  {dayName(d).slice(0, 3)}
                </button>
              ))}
            </div>
            <p className="muted small-label">{tn(days.length, '{n} sortie par semaine', '{n} sorties par semaine')} · {t('2 à 6')}</p>
            <label>{t('Sortie longue le')}
              <select value={longDay} onChange={(e) => setLongDay(Number(e.target.value))}>
                {WEEK.filter((d) => days.includes(d)).map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
              </select>
            </label>
          </section>
        )}
        {screen === 'preview' && plan && (
          <section className="card">
            <h2>{t('Ton plan {goal}', { goal: g.label })}</h2>
            <div className="phase-bar" aria-hidden="true">
              {plan.weeks.map((w, k) => <span key={k} className={w.phase} style={{ '--h': `${(w.volume / Math.max(...plan.weeks.map((x) => x.volume))) * 100}%` }} />)}
            </div>
            <p className="phase-legend muted small-label">
              {Object.keys(PHASES).filter((p) => plan.weeks.some((w) => w.phase === p)).map((p) => <span key={p} className={p}>{PHASES[p].label}</span>)}
            </p>
            <div className="totals">
              <div><span>{t('Semaines')}</span><b>{plan.weeks.length}</b></div>
              <div><span>{t('Semaine max')}</span><b>{fmtDist(Math.max(...plan.weeks.map((w) => w.volume)), 0)} <small>{distUnit()}</small></b></div>
              <div><span>{t('Plus longue sortie')}</span><b>{fmtDist(Math.max(...plan.sessions.filter((s) => s.type === 'long').map((s) => s.distance)), 0)} <small>{distUnit()}</small></b></div>
              <div><span>{t('Temps visé')}</span><b>{fmtDuration(raceTime(vdot, g.m))}</b></div>
            </div>
            <p className="muted small-label">{t('Temps estimé à ton niveau actuel ; il évoluera avec toi. Ce plan est un guide général, pas un avis médical : en cas de douleur ou de maladie, lève le pied.')}</p>
          </section>
        )}
        <button type="button" onClick={next} disabled={!valid}>{screen === 'preview' ? t('Commencer le plan') : t('Suivant')}</button>
      </main>
    </>
  );
}
