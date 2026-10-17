import { t } from '../lib/i18n.js';
import { useState } from 'react';
import { fmtGoalValue, goalLabel, goalProgress, GOAL_PERIODS, METRICS } from '../lib/goals.js';
import { SPORTS } from '../lib/sports.js';

/** Custom goals with a progress ring each, plus an inline form to add one. */
export default function Goals({ goals, activities, onSave }) {
  const [adding, setAdding] = useState(false);
  const remove = (id) => onSave(goals.filter((g) => g.id !== id));
  return (
    <section className="card">
      <h3>{t('Objectifs')}</h3>
      {goals.length === 0 && !adding && <p className="muted">{t('Fixe-toi un cap : distance, temps, dénivelé ou nombre de sorties.')}</p>}
      <ul className="goals">
        {goals.map((g, i) => {
          const p = goalProgress(g, activities);
          const { unit } = METRICS[g.metric];
          return (
            <li key={g.id} className={p.done ? 'done' : ''}>
              <svg className="ring" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" />
                {p.ratio > 0 && <circle cx="18" cy="18" r="15.5" pathLength="1" strokeDasharray={`${p.ratio} 1`} style={{ '--i': i }} />}
                <text x="18" y="18">{p.done ? '✓' : `${Math.floor(p.ratio * 100)}%`}</text>
              </svg>
              <div>
                <b>{goalLabel(g)}</b>
                <span className="muted">{fmtGoalValue(g.metric, p.value)} / {fmtGoalValue(g.metric, g.target)} {unit}{p.done && t(' · atteint 🎉')}</span>
              </div>
              <button type="button" className="ghost small" aria-label={t("Supprimer l'objectif {goal}", { goal: goalLabel(g) })} onClick={() => remove(g.id)}>✕</button>
            </li>
          );
        })}
      </ul>
      {adding
        ? <GoalForm onCancel={() => setAdding(false)} onAdd={async (g) => { await onSave([...goals, g]); setAdding(false); }} />
        : <div className="row"><button type="button" className="ghost" onClick={() => setAdding(true)}>{t('+ Ajouter un objectif')}</button></div>}
    </section>
  );
}

function GoalForm({ onAdd, onCancel }) {
  const [sport, setSport] = useState('');
  const [metric, setMetric] = useState('distance');
  const [period, setPeriod] = useState('week');
  const [target, setTarget] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const v = Number(target);
    if (!(v > 0)) return;
    onAdd({ id: crypto.randomUUID(), sport, metric, period, target: Math.round(v * METRICS[metric].scale) });
  };
  return (
    <form className="edit goal-form" onSubmit={submit}>
      <div className="row">
        <label>{t('Sport')}
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">{t('Tous sports')}</option>
            {Object.entries(SPORTS).map(([id, s]) => <option key={id} value={id}>{s.icon} {s.label}</option>)}
          </select>
        </label>
        <label>{t('Période')}
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {Object.entries(GOAL_PERIODS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <label>{t('Mesure')}
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {Object.entries(METRICS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
        </label>
        <label>{t('Cible')}{METRICS[metric].unit && ` (${METRICS[metric].unit})`}
          <input type="number" inputMode="decimal" min="0" step="any" required value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
      </div>
      <div className="edit-actions">
        <button type="button" className="ghost" onClick={onCancel}>{t('Annuler')}</button>
        <button type="submit">{t('Ajouter')}</button>
      </div>
    </form>
  );
}
