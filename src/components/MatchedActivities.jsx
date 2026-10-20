import { t, tn } from '../lib/i18n.js';
import { useMemo } from 'react';
import { fmtDay, fmtDuration } from '../lib/format.js';
import { matchedActivities } from '../lib/matched.js';
import { effort } from '../lib/sports.js';

/** Other efforts on the same route, newest first. Ranked by average pace, since distances differ by up to 10 %. */
export default function MatchedActivities({ meta, activities }) {
  const matches = useMemo(() => matchedActivities(meta, activities ?? []), [meta, activities]);
  if (matches.length < 2) return null;
  const byPace = [...matches].sort((a, b) => a.avgPace - b.avgPace);
  const rank = byPace.findIndex((m) => m.id === meta.id) + 1;
  const best = byPace[0].avgPace;

  return (
    <section className="card">
      <h3>{t('Même parcours')} <span className="muted small-label">{tn(matches.length, '{n} sortie', '{n} sorties')}</span></h3>
      <p className="matched-sum">
        {t(rank === 1 ? '🏆 Ta sortie la plus rapide sur {n}' : '{rank}e plus rapide sur {n}', { rank, n: matches.length })}
      </p>
      <ul className="matched">
        {[...matches].reverse().map((m, i) => {
          const e = effort(m.sport, m.avgPace);
          const row = (
            <>
              <span className="matched-date">{fmtDay(m.date, '2-digit')}</span>
              <span className="matched-bar"><span className="bar" style={{ width: `${(best / m.avgPace) * 100}%`, '--i': i }} /></span>
              <b>{fmtDuration(m.movingTime)}</b>
              <span className="muted">{e.value} {e.unit}</span>
            </>
          );
          return (
            <li key={m.id} className={m.id === meta.id ? 'current' : ''}>
              {m.id === meta.id ? <div>{row}</div> : <a href={`#/activity/${m.id}`}>{row}</a>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
