import { t } from '../lib/i18n.js';
import { distUnit, fmtDay, fmtDist, fmtDuration, fmtPaceUnit, paceUnit } from '../lib/format.js';

// Whole km stay whole ("5 km"); miles and odd distances get one decimal.
const fmtKm = (m) => `${fmtDist(m, distUnit() === 'km' && m % 1000 === 0 ? 0 : 1)} ${distUnit()}`;

/** Predicted race times. predictions: [{ id, label, m, time?, from? }] from predictRaces(). */
export default function RacePredictions({ predictions }) {
  if (!predictions.some((p) => p.time)) return null;
  return (
    <section className="card">
      <h3>{t('Prédictions de course')} <span className="muted small-label">{t('90 derniers jours')}</span></h3>
      <ul className="records">
        {predictions.map((p) => (
          <li key={p.id}>
            <span className="rec-label">{p.label}</span>
            {p.time ? (
              <a href={`#/activity/${p.from.activity.id}`}>
                <b>{fmtDuration(p.time)}</b>
                <span className="muted">{fmtPaceUnit(p.time / (p.m / 1000))} {paceUnit()} · {t("d'après {dist} du {date}", { dist: fmtKm(p.from.m), date: fmtDay(p.from.activity.date) })}</span>
              </a>
            ) : (
              <span className="muted">{t('Course plus longue nécessaire')}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
