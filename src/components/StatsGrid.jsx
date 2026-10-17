import { fmtDuration, fmtPace } from '../lib/format.js';
import { effort, usesGap } from '../lib/sports.js';
import StatMetric from './StatMetric.jsx';

const km = (v) => (v / 1000).toFixed(2);
const int = (v) => Math.round(v);

/** Bento grid of an activity's stats: distance as the wide hero tile, the rest around it; numbers count up. */
export default function StatsGrid({ act }) {
  const e = effort(act.sport, act.avgPace);
  const tiles = [
    { label: 'Distance', count: act.distance, format: km, unit: 'km', size: 'xl', cls: 'hero' },
    act.movingTime != null ? { label: 'Temps en mouvement', count: act.movingTime, format: fmtDuration } : { label: 'Temps en mouvement', value: '—' },
    { label: e.label, value: e.value, unit: act.avgPace ? e.unit : '', sub: usesGap(act.sport) && act.gap ? `GAP ${fmtPace(act.gap)} /km` : null },
    act.gain != null ? { label: 'Dénivelé positif', count: act.gain, format: int, unit: 'm' } : { label: 'Dénivelé positif', value: '—' },
    act.avgHr ? { label: 'FC moyenne', count: act.avgHr, format: int, unit: 'bpm' } : { label: 'FC moyenne', value: '—' },
    act.avgPower && { label: 'Puissance moy.', count: act.avgPower, format: int, unit: 'W' },
  ].filter(Boolean);
  return (
    <div className="bento">
      {tiles.map(({ cls = '', size = 'lg', ...t }) => <StatMetric key={t.label} className={`card tile ${cls}`} size={size} {...t} />)}
    </div>
  );
}
