import { t, tn } from '../lib/i18n.js';
import { useMemo, useState } from 'react';
import RunDays from '../components/RunDays.jsx';
import Segmented from '../components/Segmented.jsx';
import { workoutSummary } from '../components/WorkoutEditor.jsx';
import { distLen, distUnit, fmtDay, fmtDist, fmtDuration, fromInput, parseNum, toInput } from '../lib/format.js';
import { raceTime, vdot as vdotOf } from '../lib/paces.js';
import { defaultRaceDate, EXPERIENCE, generatePlan, GOALS, PHASES, planDefaults, planWeeks, PROGRAMS, START_LEVELS, startWeeks } from '../lib/plan.js';
import { back, go } from '../router.js';

const DAY = 86400e3;
const EXPERIENCE_LABELS = { get beginner() { return t('Débutant'); }, get intermediate() { return t('Intermédiaire'); }, get advanced() { return t('Confirmé'); } };
const LEVEL_LABELS = { get none() { return t('Pas encore'); }, get five() { return t('Environ 5 min'); }, get ten() { return t('10 min ou plus'); } };
const BREAK_LABELS = { get short() { return t('Moins d’un mois'); }, get medium() { return t('1 à 3 mois'); }, get long() { return t('Plus de 3 mois'); } };
/** Questions of each program; race plans ask date, fitness, volume, days. */
const SCREENS = { start: ['level', 'weeks', 'days'], return: ['break', 'volume', 'days'], fitness: ['fitness', 'volume', 'days'] };

/** `#/plan/new(/:goal)`: one question per screen, prefilled from history, ending on a preview. */
export default function PlanSetupPage({ activities, goal: goalParam, onCreate }) {
  const defaults = useMemo(() => activities && planDefaults(activities), [activities]);
  if (!defaults) return <main className="detail" aria-busy="true" />;
  return <Wizard defaults={defaults} goalParam={GOALS[goalParam] || PROGRAMS[goalParam] ? goalParam : null} onCreate={onCreate} />;
}

function Wizard({ defaults, goalParam, onCreate }) {
  const [goal, setGoal] = useState(goalParam ?? '10k');
  const [raceDate, setRaceDate] = useState(() => defaultRaceDate(GOALS[goalParam] ? goalParam : '10k', defaults.start, defaults.longDay));
  const [race, setRace] = useState(null); // { goal, h, min, sec } a race time typed in, when history gives no fitness or the athlete prefers it
  const [weekly, setWeekly] = useState(fmtDist(goalParam === 'return' ? defaults.before : defaults.weekly, 0));
  const [experience, setExperience] = useState(defaults.experience);
  const [days, setDays] = useState(defaults.days);
  const [longDay, setLongDay] = useState(defaults.longDay);
  const [level, setLevel] = useState('none'); // start running: how long the athlete runs non-stop
  const [weeksN, setWeeksN] = useState(startWeeks(0));
  const [breakLength, setBreakLength] = useState(defaults.breakLength);
  const [injury, setInjury] = useState(false);
  const screens = [...(goalParam ? [] : ['goal']), ...(SCREENS[goal] ?? ['date', 'fitness', 'volume', 'days']), 'preview'];
  const [i, setI] = useState(0);
  const screen = screens[i];

  const typed = race && (Number(race.h) || 0) * 3600 + (Number(race.min) || 0) * 60 + (Number(race.sec) || 0);
  const vdot = typed ? Math.round(vdotOf(GOALS[race.goal].m, typed) * 10) / 10 : defaults.vdot;
  const g = GOALS[goal], program = PROGRAMS[goal];
  const minDate = defaults.start + ((g?.taper ?? 0) + 1) * 7 * DAY;
  const maxDate = defaults.start + 30 * 7 * DAY;
  const base = { goal, start: defaults.start, runs: days.length, days, longDay, weekly: Math.max(0, parseNum(weekly) || 0) * distLen() };
  const inputs = goal === 'start' ? { goal, start: defaults.start, days, longDay: days[0], runs: days.length, weeks: weeksN, level: START_LEVELS[level] }
    : goal === 'return' ? { ...base, breakLength, injury, vdot: defaults.vdot }
      : goal === 'fitness' ? { ...base, experience, vdot }
        : { ...base, raceDate, vdot, experience };
  const weeks = g && planWeeks(inputs);
  const plan = useMemo(() => (screen === 'preview' ? generatePlan(inputs) : null), [screen]); // inputs read when the preview opens

  const pickGoal = (id) => {
    setGoal(id);
    if (GOALS[id]) setRaceDate(defaultRaceDate(id, defaults.start, longDay));
    setWeekly(fmtDist(id === 'return' ? defaults.before : defaults.weekly, 0));
  };
  const pickLevel = (id) => { setLevel(id); setWeeksN(startWeeks(START_LEVELS[id])); };
  const fitOk = vdot > 20 && vdot < 90;
  const valid = {
    goal: true,
    date: raceDate >= minDate && raceDate <= maxDate,
    fitness: goal === 'fitness' ? !typed || fitOk : fitOk, // a fitness plan runs by effort without one
    volume: weekly !== '' && Number.isFinite(parseNum(weekly)),
    days: days.length >= 2 && days.length <= (goal === 'start' ? 4 : 6),
    level: true,
    weeks: true,
    break: true,
    preview: true,
  }[screen];
  const next = () => (i < screens.length - 1 ? setI(i + 1) : (onCreate(generatePlan(inputs, Date.now())), go('/', true)));
  const top = plan && Math.max(...plan.weeks.map((w) => w.volume));
  const longest = plan && Math.max(0, ...plan.sessions.filter((s) => s.type === 'long').map((s) => s.distance));

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
              {Object.entries(PROGRAMS).map(([id, x]) => (
                <button key={id} type="button" className={goal === id ? 'on' : ''} aria-pressed={goal === id} onClick={() => pickGoal(id)}>
                  <span>{x.label}</span><small>{t('Sans course')}</small>
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
        {screen === 'level' && (
          <section className="card">
            <h2>{t('Combien de temps cours-tu sans t’arrêter ?')}</h2>
            <div className="pick-list">
              {Object.keys(START_LEVELS).map((id) => (
                <button key={id} type="button" className={level === id ? 'on' : ''} aria-pressed={level === id} onClick={() => pickLevel(id)}>
                  <span>{LEVEL_LABELS[id]}</span>
                </button>
              ))}
            </div>
            <p className="muted small-label">{t('Le plan alterne course et marche, puis allonge la course jusqu’à 30 min sans t’arrêter.')}</p>
          </section>
        )}
        {screen === 'weeks' && (
          <section className="card edit">
            <h2>{t('Sur combien de semaines ?')}</h2>
            <label>{t('Durée')} · <b>{tn(weeksN, '{n} semaine', '{n} semaines')}</b>
              <input type="range" min={PROGRAMS.start.weeks[0]} max={PROGRAMS.start.weeks[2]} step={1} value={weeksN} onChange={(e) => setWeeksN(Number(e.target.value))} />
            </label>
            <p className="muted small-label">{t('Début le {day}', { day: fmtDay(defaults.start) })} · {t('Plus de semaines, une progression plus douce.')}</p>
          </section>
        )}
        {screen === 'break' && (
          <section className="card edit">
            <h2>{t('Ta pause')}</h2>
            <Segmented label={t('Sans courir depuis')} value={breakLength} onChange={setBreakLength}
              options={Object.keys(BREAK_LABELS).map((id) => ({ id, label: BREAK_LABELS[id] }))} />
            <Segmented label={t('À cause d’une blessure ?')} value={injury ? 'yes' : 'no'} onChange={(v) => setInjury(v === 'yes')}
              options={[{ id: 'no', label: t('Non') }, { id: 'yes', label: t('Oui') }]} />
            {injury && <p className="muted small-label">{t('Reprise plus douce : volume de départ plus bas, +5 % par semaine. Demande l’avis d’un soignant avant de reprendre.')}</p>}
          </section>
        )}
        {screen === 'fitness' && (
          <section className="card edit">
            <h2>{t('Ton niveau actuel')}</h2>
            {defaults.fit && !race && (
              <p>{t('VDOT {vdot}, d’après ton {dist} en {time} le {day}.', { vdot: defaults.fit.vdot, dist: `${fmtDist(defaults.fit.distance, 1)} ${distUnit()}`, time: fmtDuration(defaults.fit.time), day: fmtDay(defaults.fit.activity.date) })}</p>
            )}
            {!defaults.fit && !race && (
              <p className="muted">{program
                ? t('Pas de course récente dans ton historique : indique un temps de course, ou continue et cours à l’effort perçu.')
                : t('Pas de course récente dans ton historique : indique un temps de course récent.')}</p>
            )}
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
                {fitOk && <p className="muted">{t('VDOT {vdot}', { vdot })}</p>}
                {(defaults.fit || program) && <button type="button" className="ghost" onClick={() => setRace(null)}>{defaults.fit ? t('Utiliser mon historique') : t('Annuler')}</button>}
              </>
            ) : (
              <button type="button" className="ghost" onClick={() => setRace({ goal: '10k', h: '', min: '', sec: '' })}>{t('Indiquer un temps de course')}</button>
            )}
          </section>
        )}
        {screen === 'volume' && (
          <section className="card edit">
            <h2>{goal === 'return' ? t('Ton volume avant la pause') : t('Ton volume actuel')}</h2>
            <label>{t('Distance par semaine ({unit})', { unit: distUnit() })}
              <input inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
            </label>
            <p className="muted small-label">{goal === 'return'
              ? t('Moyenne des 4 semaines avant ta dernière sortie : {dist} {unit}.', { dist: fmtDist(defaults.before, 0), unit: distUnit() })
              : t('Moyenne de tes 4 dernières semaines : {dist} {unit}.', { dist: fmtDist(defaults.weekly, 0), unit: distUnit() })}</p>
            {goal !== 'return' && (
              <Segmented label={t('Expérience')} value={experience} onChange={setExperience}
                options={EXPERIENCE.map((id) => ({ id, label: EXPERIENCE_LABELS[id] }))} />
            )}
          </section>
        )}
        {screen === 'days' && (
          <section className="card edit">
            <h2>{t('Tes jours de course')}</h2>
            {goal === 'start'
              ? <RunDays days={days} max={4} onDays={setDays} />
              : <RunDays days={days} longDay={longDay} onDays={setDays} onLongDay={setLongDay} />}
            {goal === 'start' && <p className="muted small-label">{t('3 sorties par semaine, avec un jour de repos entre deux, c’est l’idéal pour débuter.')}</p>}
          </section>
        )}
        {screen === 'preview' && plan && (
          <section className="card">
            <h2>{g ? t('Ton plan {goal}', { goal: g.label }) : program.label}</h2>
            <div className="phase-bar" aria-hidden="true">
              {plan.weeks.map((w, k) => <span key={k} className={w.phase} style={{ '--h': `${(w.volume / top) * 100}%` }} />)}
            </div>
            <p className="phase-legend muted small-label">
              {Object.keys(PHASES).filter((p) => plan.weeks.some((w) => w.phase === p)).map((p) => <span key={p} className={p}>{PHASES[p].label}</span>)}
            </p>
            {goal === 'start' ? (
              <div className="totals">
                <div><span>{t('Semaines')}</span><b>{plan.weeks.length}</b></div>
                <div><span>{t('Séances')}</span><b>{plan.sessions.length}</b></div>
                <div><span>{t('Semaine 1')}</span><b>{workoutSummary(plan.sessions[0])}</b></div>
                <div><span>{t('Objectif')}</span><b>{t('30 min sans arrêt')}</b></div>
              </div>
            ) : (
              <div className="totals">
                <div><span>{goal === 'fitness' ? t('Semaines par bloc') : t('Semaines')}</span><b>{plan.weeks.length}</b></div>
                <div><span>{t('Semaine max')}</span><b>{fmtDist(top, 0)} <small>{distUnit()}</small></b></div>
                <div><span>{t('Plus longue sortie')}</span><b>{fmtDist(longest, 0)} <small>{distUnit()}</small></b></div>
                {g && <div><span>{t('Temps visé')}</span><b>{fmtDuration(raceTime(vdot, g.m))}</b></div>}
              </div>
            )}
            {goal === 'fitness' && <p className="muted small-label">{t('Un nouveau bloc de 4 semaines s’ajoute à la fin de chaque bloc.')}</p>}
            <p className="muted small-label">{g
              ? t('Temps estimé à ton niveau actuel ; il évoluera avec toi. Ce plan est un guide général, pas un avis médical : en cas de douleur ou de maladie, lève le pied.')
              : t('Ce plan est un guide général, pas un avis médical : en cas de douleur ou de maladie, lève le pied.')}</p>
          </section>
        )}
        <button type="button" onClick={next} disabled={!valid}>{screen === 'preview' ? t('Commencer le plan') : t('Suivant')}</button>
      </main>
    </>
  );
}
