import { fmtDuration } from '../lib/format.js';
import { relativeEffort, timeInZones, ZONES } from '../lib/training.js';

/** Relative Effort and time in each heart-rate zone. Hidden without heart rate. */
export default function HrZones({ hist, hr }) {
  const effort = relativeEffort(hist, hr);
  if (effort == null) return null;
  const zones = timeInZones(hist, hr.max);
  const total = zones.reduce((a, b) => a + b, 0) || 1;
  return (
    <section className="card">
      <h3>Effort relatif <span className="effort-score">{effort}</span></h3>
      <ul className="zones">
        {ZONES.map((z, i) => (
          <li key={z.label}>
            <span className="zone-label">{z.label}</span>
            <span className="zone-bar"><span style={{ width: `${(zones[i] / total) * 100}%`, '--z': i, '--i': i }} /></span>
            <span className="zone-time">{fmtDuration(zones[i])}</span>
          </li>
        ))}
      </ul>
      <p className="muted small-label">Zones calculées sur une FC max de {hr.max} bpm (modifiable dans le profil).</p>
    </section>
  );
}
