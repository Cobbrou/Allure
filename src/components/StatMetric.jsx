import { useEffect, useState } from 'react';

const COUNT_MS = 700;

/**
 * One metric: small label, big tabular value and its unit, optional sub line.
 * size: 'sm' | 'md' | 'lg' | 'xl' (xl: the live chrono, readable at arm's length mid-effort).
 * count + format: the value counts up from 0 to `count` on mount, shown through `format`.
 */
export default function StatMetric({ label, value, unit, sub, size = 'md', className = '', count, format }) {
  const shown = useCountUp(count);
  return (
    <div className={`metric ${size} ${className}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{count != null ? format(shown) : value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}

/** `target`, eased up from 0 over COUNT_MS (immediately under reduced motion). */
function useCountUp(target) {
  const [v, setV] = useState(() => (target != null && !reduced() ? 0 : target));
  useEffect(() => {
    if (target == null || reduced()) return setV(target);
    const t0 = performance.now();
    let frame;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / COUNT_MS);
      setV(target * (1 - (1 - k) ** 3));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return v;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
