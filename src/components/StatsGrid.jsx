import { fmtDuration, fmtPace } from '../lib/format.js';
import { effort, usesGap } from '../lib/sports.js';

export default function StatsGrid({ act }) {
  const e = effort(act.sport, act.avgPace);
  const items = [
    ['Distance', (act.distance / 1000).toFixed(2), 'km'],
    ['Temps en mouvement', fmtDuration(act.movingTime), ''],
    [e.label, e.value, act.avgPace ? e.unit : '', usesGap(act.sport) && act.gap ? `GAP ${fmtPace(act.gap)} /km` : null],
    ['Dénivelé positif', act.gain != null ? Math.round(act.gain) : '—', act.gain != null ? 'm' : ''],
    ['FC moyenne', act.avgHr ? Math.round(act.avgHr) : '—', act.avgHr ? 'bpm' : ''],
  ];
  return (
    <div className="stats">
      {items.map(([label, value, unit, sub]) => (
        <div className="card stat" key={label}>
          <div className="label">{label}</div>
          <div className="value">{value}<small>{unit}</small></div>
          {sub && <div className="sub" title="Allure ajustée à la pente">{sub}</div>}
        </div>
      ))}
    </div>
  );
}
