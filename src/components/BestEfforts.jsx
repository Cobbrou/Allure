import { fmtDuration, fmtPaceUnit, paceUnit } from '../lib/format.js';
import { personalRecords, RECORD_DISTANCES } from '../lib/records.js';

/** This run's best efforts, flagging the ones that are current personal records. */
export default function BestEfforts({ meta, activities }) {
  const efforts = RECORD_DISTANCES.filter((r) => meta.bestEfforts?.[r.id]);
  if (meta.sport !== 'run' || !efforts.length) return null;
  const prs = new Set(personalRecords(activities ?? []).filter((r) => r.activity?.id === meta.id).map((r) => r.id));
  return (
    <section className="card">
      <h3>Meilleurs efforts</h3>
      <ul className="records">
        {efforts.map((r) => {
          const t = meta.bestEfforts[r.id];
          return (
            <li key={r.id}>
              <span className="rec-label">{r.label}</span>
              <span>
                {prs.has(r.id) && <span className="pr" title="Record personnel">PR</span>}
                <b>{fmtDuration(t)}</b>
                <span className="muted">{fmtPaceUnit(t / (r.m / 1000))} {paceUnit()}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
