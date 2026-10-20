import { t } from '../lib/i18n.js';
import { distUnit, fmtDay, fmtDist } from '../lib/format.js';

/** Weekly distance bars, oldest to newest; the last bar is the current week. */
export default function WeeklyChart({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.distance));
  const current = weeks.at(-1);
  return (
    <section className="card">
      <h3>{t('12 dernières semaines')}</h3>
      <p className="week-now"><b>{fmtDist(current.distance, 1)}</b> {distUnit()} {t('cette semaine')}</p>
      <div className="weeks" role="img" aria-label={t("Distance par semaine, de {from} à aujourd'hui", { from: fmtDay(weeks[0].start) })}>
        {weeks.map((w, i) => (
          <div key={w.start} className={`week ${i === weeks.length - 1 ? 'now' : ''}`} title={t('Semaine du {date} : {dist}', { date: fmtDay(w.start), dist: `${fmtDist(w.distance, 1)} ${distUnit()}` })}>
            <div style={{ height: `${Math.max(2, (w.distance / max) * 100)}%`, '--i': i }} />
          </div>
        ))}
      </div>
      <div className="weeks-axis"><span>{fmtDay(weeks[0].start)}</span><span>{fmtDist(max, 0)} {distUnit()} max</span><span>{t('Cette sem.')}</span></div>
    </section>
  );
}
