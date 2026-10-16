import { fmtPace } from '../lib/format.js';

export default function SplitsTable({ splits }) {
  const speeds = splits.map((s) => (s.pace ? 1 / s.pace : 0));
  const max = Math.max(...speeds);
  const best = speeds.indexOf(max);
  const maxElev = Math.max(1, ...splits.map((s) => Math.max(s.gain, s.loss)));
  return (
    <section className="card">
      <h3>Splits</h3>
      <table className="splits">
        <thead><tr><th>Km</th><th>Allure</th><th className="bar-col"></th><th>Dénivelé</th></tr></thead>
        <tbody>
          {splits.map((s, i) => (
            <tr key={i} className={i === best && max ? 'best' : ''}>
              <td>{s.dist < 990 ? (s.dist / 1000).toFixed(2) : i + 1}</td>
              <td className="pace">{fmtPace(s.pace)}</td>
              <td className="bar-col"><div className="bar" style={{ width: `${max ? (speeds[i] / max) * 100 : 0}%` }} /></td>
              <td className="elev">
                <span className="up" style={{ '--w': `${(s.gain / maxElev) * 40}px` }}>+{Math.round(s.gain)}</span>
                <span className="down" style={{ '--w': `${(s.loss / maxElev) * 40}px` }}>−{Math.round(s.loss)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
