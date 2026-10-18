import { locale, t } from '../lib/i18n.js';
import { useMemo } from 'react';
import { achievements } from '../lib/achievements.js';

/** Achievements gallery: unlocked badges with their date, locked ones greyed with their progress. */
export default function Achievements({ activities }) {
  const list = useMemo(() => achievements(activities), [activities]);
  const done = list.filter((a) => a.done).length;
  return (
    <section className="card">
      <h3>{t('Succès')} <span className="muted small-label">{done}/{list.length}</span></h3>
      <ul className="trophies achievements">
        {list.map((a) => (
          <li key={a.id} className={a.done ? '' : 'locked'} title={a.text}>
            <span className="badge-icon" aria-hidden="true">{a.icon}</span>
            <b>{a.title}</b>
            <span className="muted">{a.done ? new Date(a.doneAt).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : a.text}</span>
            {!a.done && (
              <div className="progress" role="progressbar" aria-label={a.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(a.ratio * 100)}>
                <div style={{ width: `${a.ratio * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
