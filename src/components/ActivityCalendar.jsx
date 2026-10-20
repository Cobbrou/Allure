import { locale, t, tn } from '../lib/i18n.js';
import { distUnit, fmtDist } from '../lib/format.js';
import { useMemo, useState } from 'react';
import { byDay, monthGrid, startOfDay, weekdayInitials } from '../lib/stats.js';

/** Month calendar: one dot per active day (size ~ distance), tap opens that day's activity. */
export default function ActivityCalendar({ activities, sport }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const days = useMemo(() => byDay(activities, sport), [activities, sport]);
  const grid = monthGrid(cursor.y, cursor.m);
  const today = startOfDay(Date.now());
  const shift = (n) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const title = new Date(cursor.y, cursor.m, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  const activeDays = grid.flat().filter((t) => t && days.has(t)).length;

  return (
    <section className="card">
      <div className="cal-head">
        <button type="button" className="ghost icon" onClick={() => shift(-1)} aria-label={t('Mois précédent')}>‹</button>
        <h3>{title}</h3>
        <button type="button" className="ghost icon" onClick={() => shift(1)} aria-label={t('Mois suivant')}>›</button>
      </div>
      <p className="muted cal-sub">{tn(activeDays, '{n} jour actif', '{n} jours actifs')}</p>
      <div className="cal">
        {weekdayInitials().map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
        {grid.flat().map((t, i) => {
          if (!t) return <span key={i} />;
          const acts = days.get(t);
          const n = new Date(t).getDate();
          if (!acts) return <span key={i} className={`cal-day ${t === today ? 'today' : ''}`}>{n}</span>;
          const km = acts.reduce((s, a) => s + a.distance, 0) / 1000;
          return (
            <a key={i} href={`#/activity/${acts[0].id}`} className={`cal-day active ${t === today ? 'today' : ''}`}
              style={{ '--s': Math.min(1, 0.55 + km / 60) }} aria-label={`${n} : ${tn(acts.length, '{n} activité', '{n} activités')}, ${fmtDist(km * 1000, 1)} ${distUnit()}`}>
              {n}
            </a>
          );
        })}
      </div>
    </section>
  );
}
