import { t } from '../lib/i18n.js';
import { distUnit, elevUnit, fmtDist, fmtDuration, fmtElev, fmtPaceUnit, paceUnit } from '../lib/format.js';
import { effort, usesGap } from '../lib/sports.js';
import StatMetric from './StatMetric.jsx';

const int = (v) => Math.round(v);

/** Bento grid of an activity's stats: distance as the wide hero tile, the rest around it; numbers count up. */
export default function StatsGrid({ act }) {
  const e = effort(act.sport, act.avgPace);
  const tiles = [
    { label: t('Distance'), count: act.distance, format: fmtDist, unit: distUnit(), size: 'xl', cls: 'hero' },
    act.movingTime != null ? { label: t('Temps en mouvement'), count: act.movingTime, format: fmtDuration } : { label: t('Temps en mouvement'), value: '—' },
    { label: e.label, value: e.value, unit: act.avgPace ? e.unit : '', sub: usesGap(act.sport) && act.gap ? `GAP ${fmtPaceUnit(act.gap)} ${paceUnit()}` : null },
    act.gain != null ? { label: t('Dénivelé positif'), count: act.gain, format: fmtElev, unit: elevUnit() } : { label: t('Dénivelé positif'), value: '—' },
    act.avgHr ? { label: t('FC moyenne'), count: act.avgHr, format: int, unit: 'bpm' } : { label: t('FC moyenne'), value: '—' },
    act.avgPower && { label: t('Puissance moy.'), count: act.avgPower, format: int, unit: 'W' },
  ].filter(Boolean);
  return (
    <div className="bento">
      {tiles.map(({ cls = '', size = 'lg', ...tile }) => <StatMetric key={tile.label} className={`card tile ${cls}`} size={size} {...tile} />)}
    </div>
  );
}
