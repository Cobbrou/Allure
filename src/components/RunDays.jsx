import { locale, t, tn } from '../lib/i18n.js';

export const WEEK = [1, 2, 3, 4, 5, 6, 0]; // getDay values, Monday first
export const dayName = (d) => new Date(2026, 0, 4 + d).toLocaleDateString(locale(), { weekday: 'long' }); // 2026-01-04 is a Sunday

/** Run days of a plan (2 to 6, getDay values) and the long-run day, one of them. */
export default function RunDays({ days, longDay, onDays, onLongDay }) {
  const toggle = (d) => {
    if (d === longDay) return; // the long-run day stays a run day
    onDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  };
  return (
    <>
      <div className="day-picks" role="group" aria-label={t('Jours de course')}>
        {WEEK.map((d) => (
          <button key={d} type="button" className={days.includes(d) ? 'on' : ''} aria-pressed={days.includes(d)} onClick={() => toggle(d)}>
            {dayName(d).slice(0, 3)}
          </button>
        ))}
      </div>
      <p className="muted small-label">{tn(days.length, '{n} sortie par semaine', '{n} sorties par semaine')} · {t('2 à 6')}</p>
      <label>{t('Sortie longue le')}
        <select value={longDay} onChange={(e) => onLongDay(Number(e.target.value))}>
          {WEEK.filter((d) => days.includes(d)).map((d) => <option key={d} value={d}>{dayName(d)}</option>)}
        </select>
      </label>
    </>
  );
}
