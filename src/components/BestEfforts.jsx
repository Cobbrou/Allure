import { t } from '../lib/i18n.js';
import { fmtDuration, fmtPaceUnit, fmtSpeed, paceUnit, speedUnit } from '../lib/format.js';
import { effortDistances, personalRecords } from '../lib/records.js';
import { baseSport } from '../lib/sports.js';

/** This activity's best efforts, flagging the all-time and this year's personal records. */
export default function BestEfforts({ meta, activities }) {
  const efforts = effortDistances(meta.sport).filter((r) => meta.bestEfforts?.[r.id]);
  if (!efforts.length) return null;
  const mine = (recs) => new Set(recs.filter((r) => r.activity?.id === meta.id).map((r) => r.id));
  const prs = mine(personalRecords(activities ?? [], { sport: meta.sport }));
  const yearPrs = mine(personalRecords(activities ?? [], { sport: meta.sport, year: new Date(meta.date).getFullYear() }));
  const ride = baseSport(meta.sport) === 'ride';
  return (
    <section className="card">
      <h3>{t('Meilleurs efforts')}</h3>
      <ul className="records">
        {efforts.map((r) => {
          const time = meta.bestEfforts[r.id];
          const perKm = time / (r.m / 1000);
          return (
            <li key={r.id}>
              <span className="rec-label">{r.label}</span>
              <span>
                {prs.has(r.id)
                  ? <span className="pr" title={t('Record personnel')}>{t('PR')}</span>
                  : yearPrs.has(r.id) && <span className="pr" title={t("Meilleur de l'année")}>{new Date(meta.date).getFullYear()}</span>}
                <b>{fmtDuration(time)}</b>
                <span className="muted">{ride ? `${fmtSpeed(perKm)} ${speedUnit()}` : `${fmtPaceUnit(perKm)} ${paceUnit()}`}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
