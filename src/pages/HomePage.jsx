import { locale, t, tn } from '../lib/i18n.js';
import { useMemo } from 'react';
import ImportButton from '../components/ImportButton.jsx';
import { workoutSummary } from '../components/WorkoutEditor.jsx';
import { distUnit, fmtDay, fmtDist, fmtDuration } from '../lib/format.js';
import { raceTime } from '../lib/paces.js';
import { GOALS, isHard, nextSession, PHASES, SESSION_TYPES, weekOf } from '../lib/plan.js';
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
  const goal = GOALS[plan.goal.kind];
  const weeks = plan.weeks.length;
  const week = Math.min(Math.max(weekOf(plan, now), 1), weeks);
  const next = nextSession(plan, now);
  const daysLeft = Math.round((plan.goal.date - today) / DAY);
  const thisWeek = plan.sessions.filter((s) => s.week === week);
  const planned = thisWeek.reduce((n, s) => n + s.distance, 0);
  const weekStart = startOfDay(plan.inputs.start + (week - 1) * 7 * DAY + 12 * 3600e3); // noon: DST-proof
  const strip = Array.from({ length: 7 }, (_, i) => startOfDay(weekStart + i * DAY + 12 * 3600e3));
  const done = strip.reduce((n, d) => n + (runs.get(d) ?? 0), 0);

  if (daysLeft < 0) {
    return (
      <section className="card plan-today">
        <h2>{t('Plan terminé 🎉')}</h2>
        <p className="muted">{t('{goal} le {day}. Bravo pour ces {n} semaines.', { goal: goal.label, day: fmtDay(plan.goal.date), n: weeks })}</p>
        <button type="button" onClick={onEndPlan}>{t('Choisir un nouvel objectif')}</button>
      </section>
    );
  }
  return (
    <>
      <section className="card plan-race">
        <div>
          <b>{goal.label}</b>
          <span className="muted">{fmtDay(plan.goal.date, 'numeric')} · {t('objectif estimé {time}', { time: fmtDuration(raceTime(plan.vdot, goal.m)) })}</span>
        </div>
        <span className="plan-countdown">{daysLeft ? t('J-{n}', { n: daysLeft }) : t('Jour J')}</span>
      </section>
      {next && <TodayCard session={next} today={today} />}
      <section className="card">
        <h3>{t('Semaine {n} / {total}', { n: week, total: weeks })} <span className="muted small-label">{PHASES[plan.weeks[week - 1].phase].label}</span></h3>
        <ol className="week-strip">
          {strip.map((d) => {
            const s = thisWeek.find((x) => x.date === d);
            const state = runs.has(d) ? 'done' : s && d < today ? 'missed' : s ? 'planned' : 'rest';
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
