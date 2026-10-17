import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fitnessSeries } from '../lib/training.js';
import { ACCENT, GRID, AXIS, TICK } from '../theme.js';

const fmtDay = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** Fitness & Freshness over the last 90 days. */
export default function FitnessChart({ activities, hr }) {
  const data = useMemo(() => fitnessSeries(activities, hr, 90), [activities, hr]);
  if (!activities.some((a) => a.hrTime && Object.keys(a.hrTime).length)) return null;
  const today = data.at(-1);
  return (
    <section className="card">
      <h3>Forme et fraîcheur</h3>
      <div className="totals fitness-now">
        <div><span>Forme physique</span><b className="fit">{Math.round(today.fitness)}</b></div>
        <div><span>Fatigue</span><b className="fat">{Math.round(today.fatigue)}</b></div>
        <div><span>Fraîcheur</span><b>{today.form > 0 ? '+' : ''}{Math.round(today.form)}</b></div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDay} stroke={AXIS} tick={{ fill: TICK, fontSize: 12 }} minTickGap={40} />
          <YAxis stroke={AXIS} tick={{ fill: TICK, fontSize: 12 }} width={32} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={{ stroke: TICK, strokeWidth: 1 }} />
          <Line dataKey="fitness" stroke={ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="fatigue" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted small-label">Forme : charge moyenne sur 42 jours. Fatigue : sur 7 jours. Fraîcheur : forme − fatigue.</p>
    </section>
  );
}

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tip">
      <b>{fmtDay(p.date)}</b>
      <span>Forme {Math.round(p.fitness)}</span>
      <span>Fatigue {Math.round(p.fatigue)}</span>
      {p.load > 0 && <span>Effort {Math.round(p.load)}</span>}
    </div>
  );
}
