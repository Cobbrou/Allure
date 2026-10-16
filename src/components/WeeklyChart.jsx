/** Weekly distance bars, oldest to newest; the last bar is the current week. */
export default function WeeklyChart({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.distance));
  const fmt = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const current = weeks.at(-1);
  return (
    <section className="card">
      <h3>12 dernières semaines</h3>
      <p className="week-now"><b>{(current.distance / 1000).toFixed(1)}</b> km cette semaine</p>
      <div className="weeks" role="img" aria-label={`Distance par semaine, de ${fmt(weeks[0].start)} à aujourd'hui`}>
        {weeks.map((w, i) => (
          <div key={w.start} className={`week ${i === weeks.length - 1 ? 'now' : ''}`} title={`Semaine du ${fmt(w.start)} : ${(w.distance / 1000).toFixed(1)} km`}>
            <div style={{ height: `${Math.max(2, (w.distance / max) * 100)}%`, '--i': i }} />
          </div>
        ))}
      </div>
      <div className="weeks-axis"><span>{fmt(weeks[0].start)}</span><span>{(max / 1000).toFixed(0)} km max</span><span>Cette sem.</span></div>
    </section>
  );
}
