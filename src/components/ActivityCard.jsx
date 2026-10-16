import { fmtDuration } from '../lib/format.js';
import { effort, SPORTS } from '../lib/sports.js';
import RoutePreview from './RoutePreview.jsx';

export default function ActivityCard({ a }) {
  const e = effort(a.sport, a.avgPace);
  return (
    <a className="card activity-card" href={`#/activity/${a.id}`}>
      <div className="activity-head">
        <span className="sport-icon" aria-label={SPORTS[a.sport]?.label}>{SPORTS[a.sport]?.icon}</span>
        <div>
          <h2>{a.name}</h2>
          <time>{fmtDate(a.date)}</time>
        </div>
      </div>
      <dl className="mini-stats">
        <div><dt>Distance</dt><dd>{(a.distance / 1000).toFixed(2)} <small>km</small></dd></div>
        <div><dt>{e.short}</dt><dd>{e.value} <small>{e.unit}</small></dd></div>
        <div><dt>Temps</dt><dd>{fmtDuration(a.movingTime)}</dd></div>
      </dl>
      <RoutePreview coords={a.preview} />
    </a>
  );
}

export const fmtDate = (d) =>
  new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
