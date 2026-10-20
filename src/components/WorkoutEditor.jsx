import { t } from '../lib/i18n.js';
import { fmtDuration, fmtLength } from '../lib/format.js';
import Segmented from './Segmented.jsx';

const num = (v) => Math.max(0, Math.round(+v) || 0);

/** Short summary of a template: "10 min · 6 × 400 m / 1:30 · 5 min". */
export function workoutSummary(w) {
  const work = w.work.type === 'time' ? fmtDuration(w.work.value) : fmtLength(w.work.value);
  const parts = [`${w.reps} × ${work}${w.rest.value ? ` / ${fmtDuration(w.rest.value)}` : ''}`];
  if (w.warmup) parts.unshift(t('{n} min', { n: w.warmup / 60 }));
  if (w.cooldown) parts.push(t('{n} min', { n: w.cooldown / 60 }));
  return parts.join(' · ');
}

/**
 * Structured workout template: warm-up, reps of effort (distance or time) and recovery, cool-down.
 * ponytail: distances in meters and times in seconds; an mm:ss picker if typing seconds annoys.
 */
export default function WorkoutEditor({ workout: w, onChange }) {
  const set = (patch) => onChange({ ...w, ...patch });
  const field = (label, value, onValue) => (
    <label>{label}<input type="number" inputMode="numeric" min="0" value={value} onChange={(e) => onValue(num(e.target.value))} /></label>
  );
  return (
    <div className="edit workout-editor">
      <p className="muted">{workoutSummary(w)}</p>
      {field(t('Échauffement (min)'), w.warmup / 60, (n) => set({ warmup: n * 60 }))}
      {field(t('Répétitions'), w.reps, (reps) => set({ reps }))}
      <Segmented label={t('Effort')} value={w.work.type}
        options={[{ id: 'dist', label: t('Distance') }, { id: 'time', label: t('Durée') }]}
        onChange={(type) => set({ work: { type, value: type === 'dist' ? 400 : 60 } })} />
      {field(w.work.type === 'dist' ? t('Effort (m)') : t('Effort (s)'), w.work.value, (value) => set({ work: { ...w.work, value } }))}
      {field(t('Récupération (s)'), w.rest.value, (value) => set({ rest: { type: 'time', value } }))}
      {field(t('Retour au calme (min)'), w.cooldown / 60, (n) => set({ cooldown: n * 60 }))}
    </div>
  );
}
