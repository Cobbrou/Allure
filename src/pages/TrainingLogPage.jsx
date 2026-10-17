import { locale, t, weekdayInitials } from '../lib/i18n.js';
import { useMemo, useState } from 'react';
import Segmented from '../components/Segmented.jsx';
import { distUnit, fmtDist, fmtDuration } from '../lib/format.js';
import { SPORTS, sportOptions } from '../lib/sports.js';
import { trainingWeeks } from '../lib/stats.js';
import { relativeEffort } from '../lib/training.js';

const PAGE = 12; // weeks shown per "load more"

/** What sizes the bubbles. Activities without heart rate weigh 0 in effort mode. */
const SIZES = [
  { id: 'movingTime', get label() { return t('Temps'); }, of: (a) => a.movingTime ?? 0 },
  { id: 'distance', get label() { return t('Distance'); }, of: (a) => a.distance },
  { id: 'effort', get label() { return t('Effort'); }, of: (a, hr) => relativeEffort(a.hrTime, hr) ?? 0 },
];

/** Week-by-week log: one bubble per active day, sized by time, distance or effort. */
export default function TrainingLogPage({ activities, hr }) {
  const list = activities ?? [];
  const [sport, setSport] = useState('');
  const [size, setSize] = useState('movingTime');
  const [count, setCount] = useState(PAGE);
  const options = useMemo(() => sportOptions(list), [list]);
  const weeks = useMemo(() => trainingWeeks(list, count, Date.now(), sport || undefined), [list, count, sport]);
  const { of } = SIZES.find((s) => s.id === size);
  const dayValue = (acts) => acts.reduce((s, a) => s + of(a, hr), 0);
  const max = Math.max(1, ...weeks.flatMap((w) => w.days.map(dayValue)));
  // Weeks before the first activity are empty: stop offering more.
  const first = list.length ? list[list.length - 1].date : Infinity;
  const more = weeks[weeks.length - 1].start > first;

  return (
    <>
      <header className="topbar">
        <a className="back" href="#/profile" aria-label={t('Retour au profil')}>‹</a>
        <h1>{t('Journal')}</h1>
        <span className="back" aria-hidden="true" />
      </header>
      <main className="detail">
        {options.length > 2 && <Segmented label={t('Sport')} options={options} value={sport} onChange={setSport} />}
        <Segmented label={t('Taille des bulles')} options={SIZES} value={size} onChange={setSize} />
        <section className="card log">
          <div className="log-dow">{weekdayInitials().map((d, i) => <span key={i}>{d}</span>)}</div>
          {weeks.map((w) => (
            <div key={w.start} className="log-week">
              <p className="log-head">
                <b>{fmtWeek(w.start)}</b>
                <span className="muted">{fmtDist(w.totals.distance, 1)} {distUnit()} · {fmtDuration(w.totals.movingTime)}</span>
              </p>
              <div className="log-days">
                {w.days.map((acts, k) => {
                  if (!acts.length) return <span key={k} className="log-day" />;
                  const v = dayValue(acts);
                  // Area proportional to the value; a minimum keeps every activity tappable-looking.
                  const d = 14 + 26 * Math.sqrt(v / max);
                  const main = acts.reduce((a, b) => (of(b, hr) > of(a, hr) ? b : a));
                  return (
                    <a key={k} className="log-day" href={`#/activity/${main.id}`}
                      aria-label={acts.map((a) => `${SPORTS[a.sport]?.label} ${fmtDist(a.distance, 1)} ${distUnit()}`).join(', ')}>
                      <span className="bubble" style={{ '--d': `${d}px` }}>{d >= 28 && SPORTS[main.sport]?.icon}</span>
                      {acts.length > 1 && <span className="log-n">{acts.length}</span>}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
        {more && <button type="button" className="ghost" onClick={() => setCount((c) => c + PAGE)}>{t('Semaines précédentes')}</button>}
      </main>
    </>
  );
}

/** Monday timestamp -> "12 – 18 oct." or "28 sept. – 4 oct." */
function fmtWeek(start) {
  const s = new Date(start), end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opt = { day: 'numeric', month: 'short' };
  const from = s.getMonth() === end.getMonth() ? s.getDate() : s.toLocaleDateString(locale(), opt);
  return `${from} – ${end.toLocaleDateString(locale(), opt)}`;
}
