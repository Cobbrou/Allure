import { fmtDuration, fmtPaceUnit, paceUnit } from '../lib/format.js';

/** Personal records table. records: [{ id, label, m, time?, activity? }]. */
export default function RecordsList({ records }) {
  const any = records.some((r) => r.time);
  return (
    <section className="card">
      <h3>Records personnels <span className="muted small-label">course à pied</span></h3>
      {!any && <p className="muted">Aucun record pour l'instant : importe ou enregistre des courses.</p>}
      {any && (
        <ul className="records">
          {records.map((r) => (
            <li key={r.id}>
              <span className="rec-label">{r.label}</span>
              {r.time ? (
                <a href={`#/activity/${r.activity.id}`}>
                  <b>{fmtDuration(r.time)}</b>
                  <span className="muted">{fmtPaceUnit(r.time / (r.m / 1000))} {paceUnit()} · {new Date(r.activity.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </a>
              ) : (
                <span className="muted">—</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
