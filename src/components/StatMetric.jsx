/**
 * One metric: small label, big tabular value and its unit, optional sub line.
 * size: 'sm' | 'md' | 'lg' | 'xl' (xl: the live chrono, readable at arm's length mid-effort).
 */
export default function StatMetric({ label, value, unit, sub, size = 'md', className = '' }) {
  return (
    <div className={`metric ${size} ${className}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}
