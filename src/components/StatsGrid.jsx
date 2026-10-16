import { fmtDuration, fmtPace } from '../lib/format.js';

export default function StatsGrid({ act }) {
  const items = [
    ['Distance', (act.distance / 1000).toFixed(2), 'km'],
    ['Temps en mouvement', fmtDuration(act.movingTime), ''],
    ['Allure moyenne', fmtPace(act.avgPace), act.avgPace ? '/km' : ''],
    ['Dénivelé positif', act.gain != null ? Math.round(act.gain) : '—', act.gain != null ? 'm' : ''],
    ['FC moyenne', act.avgHr ? Math.round(act.avgHr) : '—', act.avgHr ? 'bpm' : ''],
  ];
  return (
    <div className="stats">
      {items.map(([label, value, unit]) => (
        <div className="card stat" key={label}>
          <div className="label">{label}</div>
          <div className="value">{value}<small>{unit}</small></div>
        </div>
      ))}
    </div>
  );
}
