import { t } from '../lib/i18n.js';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { fmtRange, workoutSummary } from '../components/WorkoutEditor.jsx';
import { distUnit, fmtDate, fmtDay, fmtDist, fmtDuration, fmtLength } from '../lib/format.js';
import { GOALS, PHASES, SESSION_TYPES, sessionWorkout, weekOf } from '../lib/plan.js';
import { startOfDay } from '../lib/stats.js';
import { back } from '../router.js';
import { startWorkout, stepLabel } from '../lib/workout.js';

/** `#/plan`: every week of the active plan. `#/plan/session/:id`: one session. */
export default function PlanPage({ plan, sessionId, onStop }) {
  if (!plan) {
    return (
      <>
        <TopBar title={t('Plan')} />
        <main className="empty"><p>{t("Pas de plan en cours.")}</p><a className="button" href="#/">{t('Choisir un objectif')}</a></main>
      </>
    );
  }
  if (sessionId) return <SessionView plan={plan} session={plan.sessions.find((s) => s.id === sessionId)} />;
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
          return (
            <details key={i} className="card plan-week" open={i + 1 === current || (current < 1 && i === 0)}>
              <summary>
                <b>{t('Semaine {n}', { n: i + 1 })}</b>
                <span className="muted">{PHASES[w.phase].label}{w.kind === 'recovery' ? ` · ${t('allégée')}` : ''} · {fmtDist(sessions.reduce((n, s) => n + s.distance, 0), 0)} {distUnit()}</span>
              </summary>
              <ul className="plan-sessions">
                {sessions.map((s) => (
                  <li key={s.id} className={s.date < today ? 'past' : s.date === today ? 'today' : ''}>
                    <a href={`#/plan/session/${s.id}`}>
                      <span className="muted">{fmtDay(s.date)}</span>
                      <b>{SESSION_TYPES[s.type].label}</b>
                      <span className="muted">{fmtDist(s.distance, 1)} {distUnit()}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        <ConfirmButton onConfirm={onStop} confirmLabel={t('Arrêter le plan ?')}>{t('Arrêter le plan')}</ConfirmButton>
      </main>
    </>
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

/** One session: steps with their target paces at the plan's fitness, start button. */
function SessionView({ plan, session: s }) {
  if (!s) return <><TopBar title={t('Séance')} to="/plan" /><main className="empty"><p>{t('Séance introuvable.')}</p></main></>;
  const live = startWorkout(sessionWorkout(s), plan.vdot);
  return (
    <>
      <TopBar title={SESSION_TYPES[s.type].label} to="/plan" />
      <main className="detail">
        <section className="card plan-today">
          <p className="muted small-label">{fmtDate(s.date).replace(/,.*$/, '')} · {t('Semaine {n}', { n: s.week })} · {PHASES[s.phase].label}</p>
          <h2>{workoutSummary(s)}</h2>
          <p className="muted">{fmtDist(s.distance, 1)} {distUnit()} · ~{fmtDuration(s.duration)}</p>
          {s.type !== 'race' && s.date >= startOfDay(Date.now()) && <a className="button" href={`#/record/workout/plan:${s.id}`}>{t('Démarrer la séance')}</a>}
        </section>
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
