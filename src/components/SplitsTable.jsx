import { fmtPace } from '../lib/format.js';
import { effort, usesGap } from '../lib/sports.js';

/** size: split length in meters (100 for swims, 1000 for runs, 5000 for rides). */
export default function SplitsTable({ splits, sport, size = 1000 }) {
  const speeds = splits.map((s) => (s.pace ? 1 / s.pace : 0));
  const max = Math.max(...speeds);
  const best = speeds.indexOf(max);
  const maxElev = Math.max(1, ...splits.map((s) => Math.max(s.gain, s.loss)));
  const km = size >= 1000;
  const gap = usesGap(sport) && splits.some((s) => s.gap);
  const label = (s, i) => {
    const partial = s.dist < size * 0.99;
    if (km) return partial ? (((i * size) + s.dist) / 1000).toFixed(2) : ((i + 1) * size) / 1000;
    return Math.round(partial ? i * size + s.dist : (i + 1) * size);
  };
  return (
    <section className="card">
      <h3>Splits</h3>
      <table className="splits">
        <thead><tr><th>{km ? 'Km' : 'm'}</th><th>{effort(sport).short}</th>{gap && <th title="Allure ajustée à la pente">GAP</th>}<th className="bar-col"></th><th>Dénivelé</th></tr></thead>
        <tbody>
          {splits.map((s, i) => (
            <tr key={i} className={i === best && max ? 'best' : ''}>
              <td>{label(s, i)}</td>
              <td className="pace">{effort(sport, s.pace).value}</td>
              {gap && <td className="gap">{fmtPace(s.gap)}</td>}
              <td className="bar-col"><div className="bar" style={{ width: `${max ? (speeds[i] / max) * 100 : 0}%` }} /></td>
              <td className="elev">
                <span className="up" style={{ '--w': `${(s.gain / maxElev) * 30}px` }}>+{Math.round(s.gain)}</span>
                <span className="down" style={{ '--w': `${(s.loss / maxElev) * 30}px` }}>−{Math.round(s.loss)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
