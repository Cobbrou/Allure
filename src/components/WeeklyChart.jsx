import { distUnit, fmtDist } from '../lib/format.js';

/** Weekly distance bars, oldest to newest; the last bar is the current week. */
export default function WeeklyChart({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.distance));
  const fmt = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const current = weeks.at(-1);
  return (
    <section className="card">
      <h3>12 dernières semaines</h3>
      <p className="week-now"><b>{fmtDist(current.distance, 1)}</b> {distUnit()} cette semaine</p>
      <div className="weeks" role="img" aria-label={`Distance par semaine, de ${fmt(weeks[0].start)} à aujourd'hui`}>
        {weeks.map((w, i) => (
          <div key={w.start} className={`week ${i === weeks.length - 1 ? 'now' : ''}`} title={`Semaine du ${fmt(w.start)} : ${fmtDist(w.distance, 1)} ${distUnit()}`}>
            <div style={{ height: `${Math.max(2, (w.distance / max) * 100)}%`, '--i': i }} />
          </div>
        ))}
      </div>
      <div className="weeks-axis"><span>{fmt(weeks[0].start)}</span><span>{fmtDist(max, 0)} {distUnit()} max</span><span>Cette sem.</span></div>
    </section>
  );
}
