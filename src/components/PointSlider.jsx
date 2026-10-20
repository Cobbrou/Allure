import { t } from '../lib/i18n.js';

/**
 * Pick a point of a track: the slider for big moves, − / + one point at a time, since a
 * long track has far more points than a finger can hit on the slider.
 * value: point index in [lo, hi] (the slider spans 0..last); text: what the point is.
 */
export default function PointSlider({ label, text, value, last, lo, hi, onChange }) {
  const set = (v) => onChange(Math.min(hi, Math.max(lo, v)));
  return (
    <div className="point-slider">
      <span>{label} · {text}</span>
      <div>
        <button type="button" className="ghost icon" aria-label={t('{label} : point précédent', { label })} disabled={value <= lo} onClick={() => set(value - 1)}>−</button>
        <input type="range" min="0" max={last} value={value} aria-label={label} onChange={(e) => set(Number(e.target.value))} />
        <button type="button" className="ghost icon" aria-label={t('{label} : point suivant', { label })} disabled={value >= hi} onClick={() => set(value + 1)}>+</button>
      </div>
    </div>
  );
}
