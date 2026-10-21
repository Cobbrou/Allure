import { t } from '../lib/i18n.js';
import { fmtDuration, fmtLength, fmtPaceUnit, paceUnit, parseNum } from '../lib/format.js';
import { INTENSITIES, workoutSteps } from '../lib/workout.js';
import Segmented from './Segmented.jsx';

const num = (v) => Math.max(0, Math.round(parseNum(v)) || 0);
const amount = (s) => (s.type === 'time' ? fmtDuration(s.value) : fmtLength(s.value));

/**
 * Short summary of a template or a { steps } workout: "10 min · 6 × 400 m / 1:30 · 5 min".
 * Efforts that differ are joined: "20:00 + 15:00 + 10:00".
 */
export function workoutSummary(w) {
  const steps = w.steps ?? workoutSteps(w);
  const work = steps.filter((s) => s.kind === 'work');
  const rest = steps.find((s) => s.kind === 'rest');
  const same = work.every((s) => s.type === work[0].type && s.value === work[0].value);
  const parts = [same && work.length > 1 ? `${work.length} × ${amount(work[0])}${rest ? ` / ${fmtDuration(rest.value)}` : ''}` : work.map(amount).join(' + ')];
  const warm = steps.find((s) => s.kind === 'warmup'), cool = steps.find((s) => s.kind === 'cooldown');
  if (warm) parts.unshift(t('{n} min', { n: warm.value / 60 }));
  if (cool) parts.push(t('{n} min', { n: cool.value / 60 }));
  return parts.join(' · ');
}

/** A resolved pace range, "4:10-4:20 /km". */
export const fmtRange = ([fast, slow], unit = true) => `${fmtPaceUnit(fast)}-${fmtPaceUnit(slow)}${unit ? ` ${paceUnit()}` : ''}`;

/**
 * Structured workout template: warm-up, reps of effort (distance or time) and recovery, cool-down.
 * paces: training paces from the current VDOT (lib/paces.js), to show what a target means; null without.
 * ponytail: distances in meters and times in seconds; an mm:ss picker if typing seconds annoys.
 */
export default function WorkoutEditor({ workout: w, paces, onChange }) {
  const set = (patch) => onChange({ ...w, ...patch });
  // min applied on blur: clamping while typing would turn a cleared "6" into "16".
  const field = (label, value, onValue, min = 0) => (
    <label>{label}<input type="number" inputMode="numeric" min={min} value={value}
      onChange={(e) => onValue(num(e.target.value))} onBlur={() => value < min && onValue(min)} /></label>
  );
  return (
    <div className="edit workout-editor">
      <p className="muted">{workoutSummary(w)}</p>
      {field(t('Échauffement (min)'), w.warmup / 60, (n) => set({ warmup: n * 60 }))}
      {field(t('Répétitions'), w.reps, (reps) => set({ reps }), 1)}
      <Segmented label={t('Effort')} value={w.work.type}
        options={[{ id: 'dist', label: t('Distance') }, { id: 'time', label: t('Durée') }]}
        onChange={(type) => set({ work: { type, value: type === 'dist' ? 400 : 60 } })} />
      {field(w.work.type === 'dist' ? t('Effort (m)') : t('Effort (s)'), w.work.value, (value) => set({ work: { ...w.work, value } }), 1)}
      <label>{t("Allure de l'effort")}
        <select value={w.pace ?? ''} onChange={(e) => set({ pace: e.target.value || null })}>
          <option value="">{t('Libre')}</option>
          {INTENSITIES.map((i) => <option key={i.id} value={i.id}>{i.label}{paces ? ` · ${fmtRange(paces[i.id])}` : ''}</option>)}
        </select>
      </label>
      {field(t('Récupération (s)'), w.rest.value, (value) => set({ rest: { type: 'time', value } }))}
      {field(t('Retour au calme (min)'), w.cooldown / 60, (n) => set({ cooldown: n * 60 }))}
    </div>
  );
}
