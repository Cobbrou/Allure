import { fmtPace } from '../lib/format.js';
import { effort, usesGap } from '../lib/sports.js';

/**
 * Splits as rows of bars, longer the faster the split: from 35 % for the slowest to full
 * width for the fastest, so small pace differences still show. Pace is written on the bar. size: split length in meters (100 swims, 1000 runs, 5000 rides).
 */
export default function SplitsTable({ splits, sport, size = 1000 }) {
  const speeds = splits.map((s) => (s.pace ? 1 / s.pace : 0));
  const max = Math.max(...speeds);
  const min = Math.min(...speeds.filter((v) => v > 0));
  const best = speeds.indexOf(max);
  const fill = (v) => (!v ? 0 : max > min ? 0.35 + (0.65 * (v - min)) / (max - min) : 1);
  const km = size >= 1000;
  const gap = usesGap(sport) && splits.some((s) => s.gap);
  const label = (s, i) => {
    const partial = s.dist < size * 0.99;
    if (km) return partial ? (((i * size) + s.dist) / 1000).toFixed(2) : ((i + 1) * size) / 1000;
    return Math.round(partial ? i * size + s.dist : (i + 1) * size);
  };
  return (
    <section className="card">
      <h3>Splits <span className="muted small-label">{effort(sport).short}{gap && ' · GAP'} · dénivelé</span></h3>
      <ol className="splits">
        {splits.map((s, i) => (
          <SplitRow key={i} label={label(s, i)} best={i === best && max > 0} fill={fill(speeds[i])}
            pace={effort(sport, s.pace).value} gap={gap ? fmtPace(s.gap) : null}
            up={s.gain} down={s.loss} />
        ))}
      </ol>
    </section>
  );
}

function SplitRow({ label, best, fill, pace, gap, up, down }) {
  return (
    <li className={best ? 'best' : ''}>
      <span className="split-km">{label}</span>
      <span className="split-bar">
        <span className="bar" style={{ width: `${fill * 100}%` }} />
        <b>{pace}</b>
        {gap && <span className="split-gap" title="Allure ajustée à la pente">{gap}</span>}
      </span>
      <span className="split-elev"><span className="up">+{Math.round(up)}</span> <span className="down">−{Math.round(down)}</span></span>
    </li>
  );
}
