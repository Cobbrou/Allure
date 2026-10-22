import { useMemo, useState } from 'react';
import { t } from '../lib/i18n.js';
import { distUnit, elevUnit, fmtDay, fmtDist, fmtDuration, fmtElev, fmtPaceUnit, fmtSpeed, paceUnit, speedUnit } from '../lib/format.js';
import { biggestActivities, personalRecords } from '../lib/records.js';
import { baseSport, SPORTS } from '../lib/sports.js';

const BIGGEST = [
  { id: 'distance', get label() { return t('Plus longue'); }, value: (a) => `${fmtDist(a.distance, 1)} ${distUnit()}` },
  { id: 'gain', get label() { return t('Plus gros D+'); }, value: (a) => `${fmtElev(a.gain)} ${elevUnit()}` },
  { id: 'movingTime', get label() { return t('Plus longue durée'); }, value: (a) => fmtDuration(a.movingTime) },
];

/** Speed for rides, pace for the others. */
const effortPace = (time, m, sport) => (baseSport(sport) === 'ride'
  ? `${fmtSpeed(time / (m / 1000))} ${speedUnit()}`
  : `${fmtPaceUnit(time / (m / 1000))} ${paceUnit()}`);

/**
 * Personal records of one sport (`sport`, else runs when there are some): fastest best
 * efforts, longest, biggest climb and longest time, of all time or of a chosen year.
 */
export default function RecordsList({ activities, sport }) {
  const own = sport || (activities.some((a) => a.sport === 'run') ? 'run' : activities[0]?.sport);
  const years = useMemo(() => [...new Set(activities.map((a) => new Date(a.date).getFullYear()))].sort((a, b) => b - a), [activities]);
  const [year, setYear] = useState('');
  const y = year ? Number(year) : undefined;
  const records = useMemo(() => personalRecords(activities, { sport: own, year: y }).filter((r) => r.time), [activities, own, y]);
  const biggest = useMemo(() => biggestActivities(activities, { sport: own, year: y }), [activities, own, y]);
  const rows = BIGGEST.filter((b) => biggest[b.id]);
  const link = (a, main, detail) => (
    <a href={`#/activity/${a.id}`}>
      <b>{main}</b>
      <span className="muted">{detail ? `${detail} · ` : ''}{fmtDay(a.date, 'numeric')}</span>
    </a>
  );
  return (
    <section className="card">
      <h3 className="year-head">
        {t('Records personnels')} <span className="muted small-label">{SPORTS[own]?.label}</span>
      </h3>
      {years.length > 1 && (
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('Année')}>
          <option value="">{t('Depuis toujours')}</option>
          {years.map((v) => <option key={v} value={v}>{t('Meilleurs de {year}', { year: v })}</option>)}
        </select>
      )}
      {!records.length && !rows.length && <p className="muted">{t("Aucun record pour l'instant : importe ou enregistre des activités.")}</p>}
      <ul className="records">
        {records.map((r) => (
          <li key={r.id}>
            <span className="rec-label">{r.label}</span>
            {link(r.activity, fmtDuration(r.time), effortPace(r.time, r.m, own))}
          </li>
        ))}
        {rows.map((b) => (
          <li key={b.id}>
            <span className="rec-label">{b.label}</span>
            {link(biggest[b.id], b.value(biggest[b.id]))}
          </li>
        ))}
      </ul>
    </section>
  );
}
