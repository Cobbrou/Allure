import { distLen, fmtElev, fmtPaceUnit, shortLen } from '../lib/format.js';
import { effort, SPORTS, usesGap } from '../lib/sports.js';

/**
 * Splits as rows of bars, longer the faster the split: from 35 % for the slowest to full
 * width for the fastest, so small pace differences still show. Pace is written on the bar. size: split length in meters (see splitSize).
 */
export default function SplitsTable({ splits, sport, size }) {
  const speeds = splits.map((s) => (s.pace ? 1 / s.pace : 0));
  const max = Math.max(...speeds);
  const min = Math.min(...speeds.filter((v) => v > 0));
  const best = speeds.indexOf(max);
  const fill = (v) => (!v ? 0 : max > min ? 0.35 + (0.65 * (v - min)) / (max - min) : 1);
  const gap = usesGap(sport) && splits.some((s) => s.gap);
  const label = (s, i) => {
    const small = SPORTS[sport]?.display === 'pace100';
    if (s.dist >= size * 0.99) return (i + 1) * (SPORTS[sport]?.split ?? 1);
    const at = i * size + s.dist;
    return small ? Math.round(at / shortLen()) : (at / distLen()).toFixed(2);
  };
  return (
    <section className="card">
      <h3>Splits <span className="muted small-label">{effort(sport).short}{gap && ' · GAP'} · dénivelé</span></h3>
      <ol className="splits">
        {splits.map((s, i) => (
          <SplitRow key={i} label={label(s, i)} best={i === best && max > 0} fill={fill(speeds[i])}
            pace={effort(sport, s.pace).value} gap={gap ? fmtPaceUnit(s.gap) : null}
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
      <span className="split-elev"><span className="up">+{fmtElev(up)}</span> <span className="down">−{fmtElev(down)}</span></span>
    </li>
  );
}
