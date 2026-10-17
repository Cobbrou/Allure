import { fmtDuration, fmtPace } from '../lib/format.js';

const fmtDay = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtKm = (m) => `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km`;

/** Predicted race times. predictions: [{ id, label, m, time?, from? }] from predictRaces(). */
export default function RacePredictions({ predictions }) {
  if (!predictions.some((p) => p.time)) return null;
  return (
    <section className="card">
      <h3>Prédictions de course <span className="muted small-label">90 derniers jours</span></h3>
      <ul className="records">
        {predictions.map((p) => (
          <li key={p.id}>
            <span className="rec-label">{p.label}</span>
            {p.time ? (
              <a href={`#/activity/${p.from.activity.id}`}>
                <b>{fmtDuration(p.time)}</b>
                <span className="muted">{fmtPace(p.time / (p.m / 1000))} /km · d'après {fmtKm(p.from.m)} du {fmtDay(p.from.activity.date)}</span>
              </a>
            ) : (
              <span className="muted">Course plus longue nécessaire</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
