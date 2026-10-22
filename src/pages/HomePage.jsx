import { locale, t, tn } from '../lib/i18n.js';
import { useMemo } from 'react';
import ImportButton from '../components/ImportButton.jsx';
import { workoutSummary } from '../components/WorkoutEditor.jsx';
import { distUnit, fmtDay, fmtDist, fmtDuration } from '../lib/format.js';
import { raceTime } from '../lib/paces.js';
import { GOALS, isHard, matchSessions, nextSession, PHASES, planLabel, PROGRAMS, SESSION_TYPES, sessionState, weekDays, weekOf } from '../lib/plan.js';
import { proposals } from '../lib/planAdapt.js';
import { startOfDay } from '../lib/stats.js';
import { LIBRARY } from '../lib/workout.js';

const DAY = 86400e3;

/** Runs per day start, to mark plan days done. */
function runDays(activities) {
  const out = new Map();
  for (const a of activities ?? []) if (a.sport === 'run') out.set(startOfDay(a.date), (out.get(startOfDay(a.date)) ?? 0) + a.distance);
  return out;
}

/** Home tab: the training hub. Today's plan session, the week, progress; a goal picker without a plan. */
export default function HomePage({ plan, activities, onImport, onEndPlan }) {
  return (
    <>
      <header className="topbar">
        <div className="logo"><span>▲</span> Allure</div>
        {plan && <a className="button ghost small" href="#/plan">{t('Mon plan')}</a>}
      </header>
      <main className="detail">
        {plan ? <PlanHub plan={plan} activities={activities} onEndPlan={onEndPlan} /> : <NoPlan activities={activities} onImport={onImport} />}
      </main>
    </>
  );
}

function PlanHub({ plan, activities, onEndPlan }) {
  const now = Date.now(), today = startOfDay(now);
  const runs = useMemo(() => runDays(activities), [activities]);
  const goal = GOALS[plan.goal.kind]; // undefined for a program (no race)
  const weeks = plan.weeks.length;
  const week = Math.min(Math.max(weekOf(plan, now), 1), weeks);
  const matches = useMemo(() => matchSessions(plan, activities ?? []), [plan, activities]);
  const next = nextSession(plan, now, matches);
  const adjust = useMemo(() => proposals(plan, activities ?? [], matches, Date.now()).length, [plan, activities, matches]);
  const daysLeft = plan.goal.date && Math.round((plan.goal.date - today) / DAY); // null: open-ended
  const thisWeek = plan.sessions.filter((s) => s.week === week);
  const planned = thisWeek.reduce((n, s) => n + s.distance, 0);
  const strip = weekDays(plan, week);
  const done = strip.reduce((n, d) => n + (runs.get(d) ?? 0), 0);

  if (daysLeft < 0) {
    return (
      <section className="card plan-today">
        <h2>{t('Plan terminé 🎉')}</h2>
        <p className="muted">{goal
          ? t('{goal} le {day}. Bravo pour ces {n} semaines.', { goal: goal.label, day: fmtDay(plan.goal.date), n: weeks })
          : t('{goal} : programme terminé. Bravo pour ces {n} semaines.', { goal: planLabel(plan), n: weeks })}</p>
        <button type="button" onClick={onEndPlan}>{t('Choisir un nouvel objectif')}</button>
      </section>
    );
  }
  return (
    <>
      <section className="card plan-race">
        <div>
          <b>{planLabel(plan)}</b>
          <span className="muted">{goal
            ? <>{fmtDay(plan.goal.date, 'numeric')} · {t('objectif estimé {time}', { time: fmtDuration(raceTime(plan.vdot, goal.m)) })}</>
            : plan.goal.date ? t('Fin le {day}', { day: fmtDay(plan.goal.date, 'numeric') }) : t('Par blocs de 4 semaines')}</span>
        </div>
        {goal && <span className="plan-countdown">{daysLeft ? t('J-{n}', { n: daysLeft }) : t('Jour J')}</span>}
      </section>
      {adjust > 0 && (
        <section className="card">
          <a className="link-card" href="#/plan">
            <span><b>{t('Ajustement proposé')}</b><span className="muted">{t('Ton plan peut s’adapter à tes dernières sorties.')}</span></span>
            <span aria-hidden="true">›</span>
          </a>
        </section>
      )}
      {next && <TodayCard session={next} today={today} />}
      <section className="card">
        <h3>{plan.goal.date ? t('Semaine {n} / {total}', { n: week, total: weeks }) : t('Semaine {n}', { n: week })} <span className="muted small-label">{PHASES[plan.weeks[week - 1].phase].label}</span></h3>
        <ol className="week-strip">
          {strip.map((d) => {
            const s = thisWeek.find((x) => x.date === d);
            const state = s ? sessionState(s, matches.get(s.id), now) : runs.has(d) ? 'done' : 'rest'; // an extra run counts too
            return (
              <li key={d} className={`${state} ${d === today ? 'today' : ''} ${s && isHard(s.type) ? 'hard' : ''}`}>
                <span className="muted">{new Date(d).toLocaleDateString(locale(), { weekday: 'narrow' })}</span>
                {s ? <a href={`#/plan/session/${s.id}`} aria-label={`${SESSION_TYPES[s.type].label} ${fmtDay(d)}`}>{fmtDist(s.distance, 0)}</a> : <span aria-hidden="true">·</span>}
              </li>
            );
          })}
        </ol>
        <div className="progress" aria-label={t('Volume de la semaine')}><div style={{ width: `${Math.min(100, (done / (planned || 1)) * 100)}%` }} /></div>
        <p className="muted small-label">{t('{done} sur {planned} {unit} prévus', { done: fmtDist(done, 1), planned: fmtDist(planned, 0), unit: distUnit() })}</p>
      </section>
      <a className="card link-card" href="#/plan">
        <span><b>{t('Tout le plan')}</b><span className="muted">{tn(plan.sessions.filter((s) => s.date >= today).length, '{n} séance à venir', '{n} séances à venir')}</span></span>
        <span aria-hidden="true">›</span>
      </a>
    </>
  );
}

/** The next session: today's with a start button, else the next one. */
function TodayCard({ session: s, today }) {
  const isToday = s.date === today;
  return (
    <section className="card plan-today">
      <p className="muted small-label">{isToday ? t("Aujourd'hui") : t('Prochaine séance · {day}', { day: fmtDay(s.date) })}</p>
      <h2>{SESSION_TYPES[s.type].label}</h2>
      <p className="muted">{workoutSummary(s)} · {fmtDist(s.distance, 1)} {distUnit()} · ~{fmtDuration(s.duration)}</p>
      <div className="edit-actions">
        <a className="button ghost" href={`#/plan/session/${s.id}`}>{t('Détails')}</a>
        {isToday && s.type !== 'race' && <a className="button" href={`#/record/workout/plan:${s.id}`}>{t('Démarrer')}</a>}
      </div>
    </section>
  );
}

function NoPlan({ activities, onImport }) {
  return (
    <>
      <section className="card plan-goals">
        <h2>{t('Prépare ta prochaine course')}</h2>
        <p className="muted">{t('Un plan sur mesure, de ton niveau actuel au jour de la course, qui suit ce que tu fais vraiment.')}</p>
        <div className="goal-grid">
          {Object.entries(GOALS).map(([id, g]) => <a key={id} className="button ghost" href={`#/plan/new/${id}`}>{g.label}</a>)}
        </div>
        {activities && !activities.some((a) => a.sport === 'run') && (
          <>
            <p className="muted small-label">{t('Importe tes sorties : ton historique pré-remplit le plan.')}</p>
            <ImportButton onImport={onImport} className="button ghost small">{t('+ Importer')}</ImportButton>
          </>
        )}
      </section>
      <section className="card">
        <h3>{t('Sans course en vue')}</h3>
        <div className="pick-list">
          <a className="button" href="#/plan/new/start"><span>{PROGRAMS.start.label}</span><small>{t('Course et marche jusqu’à 30 min')}</small></a>
          <a className="button" href="#/plan/new/return"><span>{PROGRAMS.return.label}</span><small>{t('Après une pause ou une blessure')}</small></a>
          <a className="button" href="#/plan/new/fitness"><span>{PROGRAMS.fitness.label}</span><small>{t('Entretien, par blocs de 4 semaines')}</small></a>
        </div>
      </section>
      <section className="card">
        <h3>{t('Séances à la carte')}</h3>
        <div className="pick-list">
          {LIBRARY.map((w) => (
            <a key={w.id} className="button" href={`#/record/workout/${w.id}`}><span>{w.name}</span><small>{workoutSummary(w)}</small></a>
          ))}
        </div>
      </section>
      <a className="card link-card" href="#/activities">
        <span><b>{t('Mes activités')}</b><span className="muted">{t('Toutes tes sorties, de la plus récente à la plus ancienne')}</span></span>
        <span aria-hidden="true">›</span>
      </a>
    </>
  );
}
