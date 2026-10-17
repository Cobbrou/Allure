import { fmtDuration, fmtPace } from '../lib/format.js';
import { effort, usesGap } from '../lib/sports.js';
import StatMetric from './StatMetric.jsx';

/** Bento grid of an activity's stats: distance as the wide hero tile, the rest around it. */
export default function StatsGrid({ act }) {
  const e = effort(act.sport, act.avgPace);
  const tiles = [
    { label: 'Distance', value: (act.distance / 1000).toFixed(2), unit: 'km', size: 'xl', cls: 'hero' },
    { label: 'Temps en mouvement', value: fmtDuration(act.movingTime) },
    { label: e.label, value: e.value, unit: act.avgPace ? e.unit : '', sub: usesGap(act.sport) && act.gap ? `GAP ${fmtPace(act.gap)} /km` : null },
    { label: 'Dénivelé positif', value: act.gain != null ? Math.round(act.gain) : '—', unit: act.gain != null ? 'm' : '' },
    { label: 'FC moyenne', value: act.avgHr ? Math.round(act.avgHr) : '—', unit: act.avgHr ? 'bpm' : '' },
    act.avgPower && { label: 'Puissance moy.', value: act.avgPower, unit: 'W' },
  ].filter(Boolean);
  return (
    <div className="bento">
      {tiles.map(({ cls = '', size = 'lg', ...t }) => <StatMetric key={t.label} className={`card tile ${cls}`} size={size} {...t} />)}
    </div>
  );
}
