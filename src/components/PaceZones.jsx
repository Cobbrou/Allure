import { useMemo } from 'react';
import { t } from '../lib/i18n.js';
import { distUnit, fmtDay, fmtDist, fmtDuration, fmtPaceUnit, paceUnit } from '../lib/format.js';
import { currentVdot, PACE_ZONES, timeInPaceZones, trainingPaces } from '../lib/paces.js';

/** Time in each pace zone of a run, zones from the fitness (VDOT) at its date. Works without a strap. */
export default function PaceZones({ act, activities }) {
  const fit = useMemo(() => currentVdot(activities ?? [], act.date), [activities, act.date]);
  const zones = useMemo(() => fit && timeInPaceZones(act.track, trainingPaces(fit.vdot)), [fit, act.track]);
  const total = zones?.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const paces = trainingPaces(fit.vdot);
  return (
    <section className="card">
      <h3>{t("Zones d'allure")}</h3>
      <ul className="zones">
        {PACE_ZONES.map((z, i) => {
          const from = z.from(paces);
          return (
            <li key={z.label}>
              <span className="zone-label">{z.label}{Number.isFinite(from) && <small className="muted"> {t('< {pace}', { pace: `${fmtPaceUnit(from)}${paceUnit()}` })}</small>}</span>
              <span className="zone-bar"><span style={{ width: `${(zones[i] / total) * 100}%`, '--z': i, '--i': i }} /></span>
              <span className="zone-time">{fmtDuration(zones[i])}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted small-label">
        {t('Zones calculées sur un VDOT de {vdot} ({dist} en {time} le {day}).', {
          vdot: fit.vdot, dist: `${fmtDist(fit.distance, 1)} ${distUnit()}`, time: fmtDuration(fit.time), day: fmtDay(fit.activity.date),
        })}
      </p>
    </section>
  );
}
