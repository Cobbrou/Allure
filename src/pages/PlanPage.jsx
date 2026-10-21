import { t } from '../lib/i18n.js';
import { useMemo, useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import RunDays, { dayName } from '../components/RunDays.jsx';
import { fmtRange, workoutSummary } from '../components/WorkoutEditor.jsx';
import { distUnit, fmtDate, fmtDay, fmtDist, fmtDuration, fmtLength } from '../lib/format.js';
import { changeDays, compliance, GOALS, hardNextTo, isHard, makeUp, makeUpSlot, matchSessions, moveSession, PHASES, SESSION_TYPES, sessionState, sessionWorkout, weekDays, weekOf } from '../lib/plan.js';
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
        {current < plan.weeks.length - 1 && <DaysCard plan={plan} onSave={onSave} />}
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
