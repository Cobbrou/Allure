import { useState } from 'react';
import { distUnit, fmtDist, fmtDuration } from '../lib/format.js';
import { effort, SPORTS } from '../lib/sports.js';
import RoutePreview from './RoutePreview.jsx';
import StatMetric from './StatMetric.jsx';

/**
 * Feed card: athlete header, title, the three key metrics, route and an action bar.
 * The title link stretches over the whole card; the action bar sits above it.
 */
export default function ActivityCard({ a, i = 0, onShare }) {
  const e = effort(a.sport, a.avgPace);
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    setSharing(true);
    try { await onShare(a.id); } finally { setSharing(false); }
  };
  return (
    <article className="card activity-card" style={{ '--i': Math.min(i, 8) }}>
      <header className="activity-head">
        <span className="avatar sm" aria-hidden="true">A</span>
        <div>
          <b>Athlète Allure</b>
          <span className="muted">{SPORTS[a.sport]?.icon} {SPORTS[a.sport]?.label} · <time>{fmtDate(a.date)}</time></span>
        </div>
      </header>
      <h2><a className="stretched" href={`#/activity/${a.id}`}>{a.name}</a></h2>
      <div className="metrics-row">
        <StatMetric label="Distance" value={fmtDist(a.distance)} unit={distUnit()} size="lg" />
        <StatMetric label={e.short} value={e.value} unit={a.avgPace ? e.unit : ''} size="lg" />
        <StatMetric label="Temps" value={fmtDuration(a.movingTime)} size="lg" />
      </div>
      {a.preview?.length > 1 && <div className="map-frame"><RoutePreview coords={a.preview} /></div>}
      <footer className="action-bar">
        {onShare && (
          <button type="button" className="action" onClick={share} disabled={sharing}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
            {sharing ? 'Préparation…' : 'Partager'}
          </button>
        )}
        <a className="action" href={`#/activity/${a.id}`} tabIndex={-1}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>
          Analyse
        </a>
      </footer>
    </article>
  );
}

export const fmtDate = (d) =>
  new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
