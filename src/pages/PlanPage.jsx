import { t, tn } from '../lib/i18n.js';
import { useMemo, useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import RunDays, { dayName } from '../components/RunDays.jsx';
import Segmented from '../components/Segmented.jsx';
import { fmtRange, workoutSummary } from '../components/WorkoutEditor.jsx';
import { distUnit, fmtDate, fmtDay, fmtDist, fmtDuration, fmtLength, fromInput, toInput } from '../lib/format.js';
import { raceTime } from '../lib/paces.js';
import { changeDays, compliance, GOALS, hardNextTo, isHard, makeUp, makeUpSlot, matchSessions, moveSession, PHASES, planDefaults, SESSION_TYPES, sessionState, sessionWorkout, weekDays, weekOf } from '../lib/plan.js';
import { earliestRace, holdVolume, logAdjustment, proposals, RAMPS, regenerate, setVdot, unwell } from '../lib/planAdapt.js';
import { startOfDay } from '../lib/stats.js';
import { back } from '../router.js';
import { startWorkout, stepLabel } from '../lib/workout.js';

const DAY = 86400e3;
const MARKS = { done: '✓', partial: '~', missed: '✗', skipped: '–', moved: '↷' };
const STATES = {
  get done() { return t('Faite'); },
  get partial() { return t('Faite en partie'); },
  get missed() { return t('Manquée'); },
  get skipped() { return t('Passée'); },
  get moved() { return t('Rattrapée'); },
  planned: '',
};

/** `#/plan`: every week of the active plan. `#/plan/session/:id`: one session. */
export default function PlanPage({ plan, activities, sessionId, onSave, onStop }) {
  const matches = useMemo(() => plan && matchSessions(plan, activities ?? []), [plan, activities]);
  if (!plan) {
    return (
      <>
        <TopBar title={t('Plan')} />
        <main className="empty"><p>{t("Pas de plan en cours.")}</p><a className="button" href="#/">{t('Choisir un objectif')}</a></main>
      </>
    );
  }
  if (sessionId) return <SessionView plan={plan} session={plan.sessions.find((s) => s.id === sessionId)} matches={matches} activities={activities ?? []} onSave={onSave} />;
  const now = Date.now(), today = startOfDay(now), current = weekOf(plan, now);
  return (
    <>
      <TopBar title={t('Plan {goal}', { goal: GOALS[plan.goal.kind].label })} />
      <main className="detail">
        <section className="card">
          <div className="phase-bar" role="img" aria-label={t('Phases du plan')}>
            {plan.weeks.map((w, i) => <span key={i} className={`${w.phase} ${i + 1 === current ? 'now' : ''}`} style={{ '--h': `${(w.volume / Math.max(...plan.weeks.map((x) => x.volume))) * 100}%` }} />)}
          </div>
          <p className="phase-legend muted small-label">
            {Object.keys(PHASES).filter((p) => plan.weeks.some((w) => w.phase === p)).map((p) => <span key={p} className={p}>{PHASES[p].label}</span>)}
          </p>
        </section>
        <Proposals plan={plan} activities={activities ?? []} matches={matches} onSave={onSave} />
        {plan.weeks.map((w, i) => {
          const sessions = plan.sessions.filter((s) => s.week === i + 1);
          const done = sessions.reduce((n, s) => n + (matches.get(s.id)?.distance ?? 0), 0);
          return (
            <details key={i} className="card plan-week" open={i + 1 === current || (current < 1 && i === 0)}>
              <summary>
                <b>{t('Semaine {n}', { n: i + 1 })}</b>
                <span className="muted">
                  {PHASES[w.phase].label}{w.kind === 'recovery' ? ` · ${t('allégée')}` : ''} · {done ? `${fmtDist(done, 0)} / ` : ''}{fmtDist(sessions.reduce((n, s) => n + s.distance, 0), 0)} {distUnit()}
                </span>
              </summary>
              <ul className="plan-sessions">
                {sessions.map((s) => {
                  const state = sessionState(s, matches.get(s.id), now);
                  return (
                    <li key={s.id} className={`${state} ${s.date === today ? 'today' : ''}`}>
                      <a href={`#/plan/session/${s.id}`}>
                        <span className="muted">{fmtDay(s.date)}</span>
                        <b>{SESSION_TYPES[s.type].label}</b>
                        <span className="muted">{fmtDist(s.distance, 1)} {distUnit()}</span>
                        <span className="mark" aria-label={STATES[state]}>{MARKS[state] ?? ''}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
        {current < plan.weeks.length && <UnwellCard plan={plan} matches={matches} onSave={onSave} />}
        {current < plan.weeks.length - 1 && <DaysCard plan={plan} onSave={onSave} />}
        {current < plan.weeks.length - 1 && <RegenerateCard plan={plan} activities={activities ?? []} onSave={onSave} />}
        <ConfirmButton onConfirm={onStop} confirmLabel={t('Arrêter le plan ?')}>{t('Arrêter le plan')}</ConfirmButton>
      </main>
    </>
  );
}

/** Change the run days from next week on. */
function DaysCard({ plan, onSave }) {
  const [days, setDays] = useState(plan.inputs.days);
  const [longDay, setLongDay] = useState(plan.inputs.longDay);
  const changed = longDay !== plan.inputs.longDay || days.join() !== plan.inputs.days.join();
  return (
    <details className="card edit">
      <summary><b>{t('Changer mes jours de course')}</b></summary>
      <RunDays days={days} longDay={longDay} onDays={setDays} onLongDay={setLongDay} />
      <p className="muted small-label">{t('Les semaines suivantes sont recalculées ; la semaine en cours ne change pas.')}</p>
      <button type="button" disabled={!changed || days.length < 2 || days.length > 6} onClick={() => onSave(changeDays(plan, days, longDay, Date.now()))}>{t('Appliquer')}</button>
    </details>
  );
}

/** Adaptation proposals (lib/planAdapt.js): accepted or dismissed, both logged so they don't come back. */
function Proposals({ plan, activities, matches, onSave }) {
  const now = Date.now();
  const list = proposals(plan, activities, matches, now);
  if (!list.length) return null;
  const goal = GOALS[plan.goal.kind];
  const dismiss = (p) => onSave(logAdjustment(plan, { kind: p.kind, date: now, dismissed: true }));
  return list.map((p) => {
    let text, accept;
    if (p.kind === 'pace') {
      text = p.why === 'effort'
        ? t('Ton effort du {day} vaut un VDOT de {vdot} (plan : {old}).', { day: fmtDay(p.activity.date), vdot: p.vdot, old: plan.vdot })
        : p.why === 'faster'
          ? t('Tes 3 dernières séances clés étaient plus rapides que prévu, sans forcer. Passer à un VDOT de {vdot} ?', { vdot: p.vdot })
          : t('Tes 2 dernières séances clés étaient trop dures. Passer à un VDOT de {vdot} ?', { vdot: p.vdot });
      accept = () => onSave(logAdjustment(setVdot(plan, p.vdot, p.why, now), { kind: 'pace', date: now, from: plan.vdot, to: p.vdot }));
    } else if (p.hold) {
      text = t('Tu as couru {n} % du volume prévu ces 3 dernières semaines. Garder le volume la semaine prochaine au lieu de l’augmenter ?', { n: Math.round(p.ratio * 100) });
      accept = () => onSave(logAdjustment(holdVolume(plan, now), { kind: 'volume', date: now, ratio: p.ratio }));
    } else {
      text = t('Tu as couru {n} % du volume prévu ces 3 dernières semaines : le risque de blessure augmente. Reste proche du plan.', { n: Math.round(p.ratio * 100) });
    }
    return (
      <section key={p.kind} className="card plan-today proposal">
        <h3>{p.kind === 'pace' ? t('Tes allures') : t('Ton volume')}</h3>
        <p>{text}</p>
        {p.kind === 'pace' && (
          <p className="muted small-label">{t('Objectif estimé : {old} → {new}', { old: fmtDuration(raceTime(plan.vdot, goal.m)), new: fmtDuration(raceTime(p.vdot, goal.m)) })}</p>
        )}
        <div className="edit-actions">
          {accept && <button type="button" onClick={accept}>{p.kind === 'pace' ? t('Mettre à jour mes allures') : t('Garder le volume')}</button>}
          <button type="button" className="ghost" onClick={() => dismiss(p)}>{accept ? t('Ignorer') : t('Compris')}</button>
        </div>
      </section>
    );
  });
}

const UNWELL_MODES = { get easy() { return t('Footing seulement'); }, get shorter() { return t('Plus court'); }, get rest() { return t('Repos'); } };
const RAMP_LABELS = { get slow() { return t('Lente'); }, get balanced() { return t('Équilibrée'); }, get fast() { return t('Rapide'); } };

/** "Not feeling well": the next days easier, then a return ramp. */
function UnwellCard({ plan, matches, onSave }) {
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState('easy');
  const [ramp, setRamp] = useState('balanced');
  return (
    <details className="card edit">
      <summary><b>{t('Pas en forme ?')}</b></summary>
      <label>{t('Pendant')} · <b>{tn(days, '{n} jour', '{n} jours')}</b>
        <input type="range" min={3} max={14} step={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
      </label>
      <fieldset>
        <legend>{t('Pendant ces jours')}</legend>
        <Segmented label={t('Pendant ces jours')} value={mode} onChange={setMode} options={Object.keys(UNWELL_MODES).map((id) => ({ id, label: UNWELL_MODES[id] }))} />
      </fieldset>
      <fieldset>
        <legend>{t('Reprise')}</legend>
        <Segmented label={t('Reprise')} value={ramp} onChange={setRamp} options={Object.keys(RAMPS).map((id) => ({ id, label: RAMP_LABELS[id] }))} />
      </fieldset>
      <p className="muted small-label">
        {t('Reprise : {weeks} à {share} % du volume, les séances dures reviennent {when}.', {
          weeks: tn(RAMPS[ramp].length, '{n} semaine', '{n} semaines'),
          share: RAMPS[ramp].map((x) => Math.round(x * 100)).join(' → '),
          when: ramp === 'slow' ? t('la 2e semaine') : t('tout de suite'),
        })}
      </p>
      <button type="button" onClick={() => onSave(unwell(plan, { days, mode, ramp }, Date.now(), matches))}>{t('Adapter mon plan')}</button>
    </details>
  );
}

/** Plan again from next week: new race date, current fitness and recent volume. */
function RegenerateCard({ plan, activities, onSave }) {
  const now = Date.now();
  const [raceDate, setRaceDate] = useState(plan.goal.date);
  const { fit, weekly } = useMemo(() => planDefaults(activities, Date.now()), [activities]);
  const vdot = fit?.vdot ?? plan.vdot;
  const min = earliestRace(plan, now), max = plan.inputs.start + (7 * GOALS[plan.goal.kind].weeks[2] - 1) * DAY;
  const valid = raceDate >= min && raceDate <= max;
  return (
    <details className="card edit">
      <summary><b>{t('Recalculer le plan')}</b></summary>
      <label>{t('Date de la course')}
        <input type="date" value={toInput(raceDate)} min={toInput(min)} max={toInput(max)} onChange={(e) => e.target.value && setRaceDate(fromInput(e.target.value))} />
      </label>
      {!valid && <p className="record-status bad">{t('Choisis une date entre le {from} et le {to}.', { from: fmtDay(min), to: fmtDay(max, 'numeric') })}</p>}
      <p className="muted small-label">
        {t('À partir de la semaine prochaine, avec ton niveau actuel (VDOT {vdot}) et ton volume récent ({dist} {unit} par semaine). Les semaines passées ne changent pas.', { vdot, dist: fmtDist(weekly, 0), unit: distUnit() })}
      </p>
      <button type="button" disabled={!valid} onClick={() => onSave(regenerate(plan, { raceDate, vdot, weekly }, Date.now()))}>{t('Recalculer')}</button>
    </details>
  );
}

function TopBar({ title, to = '/' }) {
  return (
    <header className="topbar">
      <a className="back" href={`#${to}`} aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back(to); }}>‹</a>
      <h1>{title}</h1>
      <span className="back" aria-hidden="true" />
    </header>
  );
}

/** One session: what was done, steps with their target paces at the plan's fitness, start, move, skip. */
function SessionView({ plan, session: s, matches, activities, onSave }) {
  if (!s) return <><TopBar title={t('Séance')} to="/plan" /><main className="empty"><p>{t('Séance introuvable.')}</p></main></>;
  const now = Date.now(), today = startOfDay(now);
  const a = matches.get(s.id);
  const state = sessionState(s, a, now);
  const live = startWorkout(sessionWorkout(s), plan.vdot);
  const patch = (p) => onSave({ ...plan, sessions: plan.sessions.map((x) => (x === s ? { ...x, ...p } : x)) });
  const slot = state === 'missed' && makeUpSlot(plan, s.id, now, matches);
  const madeUp = s.status === 'moved' && plan.sessions.find((x) => x.from === s.id);
  const from = s.from && plan.sessions.find((x) => x.id === s.from);
  const canMove = state === 'planned' && s.type !== 'race';
  // Runs around the session no other session took, to link by hand.
  const taken = new Set([...matches.values()].map((x) => x.id));
  const free = !a && s.date <= today ? activities.filter((x) => x.sport === 'run' && !taken.has(x.id) && Math.abs(x.date - s.date) < 4 * DAY) : [];
  return (
    <>
      <TopBar title={SESSION_TYPES[s.type].label} to="/plan" />
      <main className="detail">
        <section className="card plan-today">
          <p className="muted small-label">{fmtDate(s.date).replace(/,.*$/, '')} · {t('Semaine {n}', { n: s.week })} · {PHASES[s.phase].label}</p>
          <h2>{workoutSummary(s)}</h2>
          <p className="muted">{fmtDist(s.distance, 1)} {distUnit()} · ~{fmtDuration(s.duration)}</p>
          {from && <p className="muted small-label">{t('Rattrapage de la séance du {day}', { day: fmtDay(from.date) })}</p>}
          {state !== 'planned' && <p className={`session-state ${state}`}>{MARKS[state]} {STATES[state]}{madeUp ? ` · ${fmtDay(madeUp.date)}` : ''}</p>}
          {a && (
            <a className="link-card" href={`#/activity/${a.id}`}>
              <span><b>{a.name}</b><span className="muted">{fmtDist(a.distance, 1)} {distUnit()} · {fmtDuration(a.movingTime)} · {Math.round(compliance(s, a).ratio * 100)} %</span></span>
              <span aria-hidden="true">›</span>
            </a>
          )}
          {canMove && s.date === today && <a className="button" href={`#/record/workout/plan:${s.id}`}>{t('Démarrer la séance')}</a>}
          {slot && <button type="button" onClick={() => onSave(makeUp(plan, s.id, slot))}>{t('La faire {day} à la place du footing', { day: fmtDay(slot.date) })}</button>}
          <div className="edit-actions">
            {canMove && <button type="button" className="ghost" onClick={() => patch({ status: 'skipped' })}>{t('Passer la séance')}</button>}
            {s.status === 'skipped' && <button type="button" className="ghost" onClick={() => patch({ status: undefined })}>{t('Rétablir')}</button>}
            {a && <button type="button" className="ghost" onClick={() => patch({ activity: null })}>{t('Ce n’est pas cette sortie')}</button>}
            {s.activity === null && !a && <button type="button" className="ghost" onClick={() => patch({ activity: undefined })}>{t('Lier automatiquement')}</button>}
          </div>
        </section>
        {canMove && <MoveCard plan={plan} session={s} today={today} matches={matches} onSave={onSave} />}
        {free.length > 0 && (
          <section className="card">
            <h3>{t('Lier une sortie')}</h3>
            <div className="pick-list">
              {free.map((x) => (
                <button key={x.id} type="button" onClick={() => patch({ activity: x.id, status: undefined })}>
                  <span>{x.name}</span><small>{fmtDay(x.date)} · {fmtDist(x.distance, 1)} {distUnit()}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="card">
          <h3>{t('Étapes')}</h3>
          <ol className="plan-steps">
            {live.steps.map((st, i) => (
              <li key={i} className={st.kind}>
                <span>{stepLabel(st, live.reps)}</span>
                <b>{st.type === 'time' ? fmtDuration(st.value) : fmtLength(st.value)}</b>
                <span className="muted">{st.target?.range ? fmtRange(st.target.range) : ''}</span>
              </li>
            ))}
          </ol>
          <p className="muted small-label">{t('Allures calculées sur un VDOT de {vdot}.', { vdot: plan.vdot })}</p>
        </section>
      </main>
    </>
  );
}

/** Move the session to another day of its week; a session already there takes its day. */
function MoveCard({ plan, session: s, today, matches, onSave }) {
  return (
    <section className="card">
      <h3>{t('Déplacer')}</h3>
      <div className="day-picks" role="group" aria-label={t('Jour de la séance')}>
        {weekDays(plan, s.week).map((d) => {
          const other = plan.sessions.find((x) => x.date === d && x !== s);
          // Past days, the race and sessions already done or decided stay put.
          const locked = d < today || (other && (other.type === 'race' || other.status || matches.has(other.id)));
          return (
            <button key={d} type="button" className={`${d === s.date ? 'on' : ''} ${other ? 'busy' : ''}`} aria-pressed={d === s.date} disabled={locked}
              aria-label={other ? `${dayName(new Date(d).getDay())} · ${SESSION_TYPES[other.type].label}` : dayName(new Date(d).getDay())}
              onClick={() => d !== s.date && onSave(moveSession(plan, s.id, d))}>
              {dayName(new Date(d).getDay()).slice(0, 3)}
            </button>
          );
        })}
      </div>
      <p className="muted small-label">{t('Un jour qui a déjà une séance : les deux échangent leur place.')}</p>
      {isHard(s.type) && hardNextTo(plan, s.date, s) && <p className="small-label warn-text">{t('Deux séances dures d’affilée : garde un jour facile entre les deux.')}</p>}
    </section>
  );
}
