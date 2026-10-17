import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useState } from 'react';
import { fmtDuration, fmtLength } from '../lib/format.js';
import { detectIntervals, lapIntervals } from '../lib/intervals.js';
import { effort } from '../lib/sports.js';
import Segmented from './Segmented.jsx';

const SOURCES = [
  { id: 'laps', get label() { return t('Tours'); } },
  { id: 'auto', get label() { return t('Efforts détectés'); } },
];

/**
 * Workout analysis: device laps, or efforts auto-detected on runs. Bars are as wide as
 * the interval is long and as tall as it is fast. Tapping one highlights it on the map.
 */
export default function Intervals({ meta, track, range }) {
  const laps = useMemo(() => lapIntervals(track, meta.laps), [track, meta.laps]);
  const auto = useMemo(() => (meta.sport === 'run' ? detectIntervals(track) : []), [track, meta.sport]);
  const [source, setSource] = useState(laps.length ? 'laps' : 'auto');
  const [sel, setSel] = useState(null);
  useEffect(() => () => range.current(null), [range]);
  const list = source === 'laps' ? laps : auto;
  if (!laps.length && !auto.length) return null;

  const pick = (i) => {
    const next = i === sel ? null : i;
    setSel(next);
    range.current(next == null ? null : [list[next].from, list[next].to]);
  };
  const choose = (s) => { setSource(s); setSel(null); range.current(null); };
  const speeds = list.map((l) => (l.time ? l.dist / l.time : 0));
  const max = Math.max(...speeds);
  const work = list.filter((l) => l.work);
  const avg = work.length && work.reduce((s, l) => s + l.time, 0) / work.reduce((s, l) => s + l.dist, 0) * 1000;
  const label = (l, i) => {
    if (l.work !== false) return `${list.slice(0, i + 1).filter((x) => x.work !== false).length}`;
    return t(i === 0 ? 'Échauff.' : i === list.length - 1 ? 'Retour|intervalle' : 'Récup');
  };
  const e = (pace) => effort(meta.sport, pace);

  return (
    <section className="card">
      <h3>{t('Intervalles')}</h3>
      {laps.length > 0 && auto.length > 0 && <Segmented label={t('Source')} options={SOURCES} value={source} onChange={choose} />}
      {work.length > 0 && (
        <p className="matched-sum intervals-sum">
          {work.length} × {fmtLength(work.reduce((s, l) => s + l.dist, 0) / work.length)} · {t('moy.')} {e(avg).value} {e(avg).unit}
        </p>
      )}
      <div className="iv-bars" role="group" aria-label={t('Intervalles')}>
        {list.map((l, i) => (
          <button key={i} type="button" aria-label={`${label(l, i)} ${fmtDuration(l.time)}`} aria-pressed={sel === i}
            className={`iv-bar ${l.work === false ? 'rest' : 'work'} ${sel === i ? 'on' : ''}`}
            style={{ flexGrow: l.time, '--h': `${Math.max(8, (speeds[i] / max) * 100)}%`, '--i': i }}
            onClick={() => pick(i)} />
        ))}
      </div>
      <table className="splits intervals">
        <thead><tr><th></th><th>{t('Dist.')}</th><th>{t('Temps')}</th><th>{e().short}</th><th>{t('FC')}</th></tr></thead>
        <tbody>
          {list.map((l, i) => (
            <tr key={i} className={`${l.work === false ? 'rest' : ''} ${sel === i ? 'on' : ''}`} onClick={() => pick(i)}>
              <td>{label(l, i)}</td>
              <td>{fmtLength(l.dist)}</td>
              <td>{fmtDuration(l.time)}</td>
              <td className="pace">{e(l.pace).value}</td>
              <td>{l.hr ? Math.round(l.hr) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

