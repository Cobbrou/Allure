import { t, tn } from '../lib/i18n.js';
import { useMemo, useState } from 'react';
import Achievements from '../components/Achievements.jsx';
import ActivityCalendar from '../components/ActivityCalendar.jsx';
import FitnessChart from '../components/FitnessChart.jsx';
import Gear from '../components/Gear.jsx';
import Goals from '../components/Goals.jsx';
import PowerCurve from '../components/PowerCurve.jsx';
import RacePredictions from '../components/RacePredictions.jsx';
import RecordsList from '../components/RecordsList.jsx';
import Segmented from '../components/Segmented.jsx';
import WeeklyChart from '../components/WeeklyChart.jsx';
import { distUnit, elevUnit, fmtDist, fmtDuration, fmtElev } from '../lib/format.js';
import { predictRaces } from '../lib/records.js';
import { leaderboard } from '../lib/segments.js';
import { SPORTS, sportOptions as sportOptionsOf } from '../lib/sports.js';
import { periodStart, totals, weeklyDistance, weekStreak, yearRecap, yearToDate } from '../lib/stats.js';

const PERIODS = [
  { id: 'week', get label() { return t('Semaine'); } },
  { id: 'month', get label() { return t('Mois'); } },
  { id: 'year', get label() { return t('Année'); } },
  { id: 'all', get label() { return t('Total'); } },
];

export default function ProfilePage({ activities, counted, hr, ftp, name, goals, onSaveGoals, segments, gears, onSaveGears }) {
  const list = activities ?? [];
  const [sport, setSport] = useState('');
  const [period, setPeriod] = useState('week');

  // Only offer sports the athlete actually has.
  const sportOptions = useMemo(() => sportOptionsOf(list), [list]);
  const tot = useMemo(() => totals(list, { from: periodStart(period), sport: sport || undefined }), [list, period, sport]);
  const weeks = useMemo(() => weeklyDistance(list, Date.now(), 12, sport || undefined), [list, sport]);
  const ytd = useMemo(() => (period === 'year' ? yearToDate(list, Date.now(), sport || undefined) : null), [list, period, sport]);
  const predictions = useMemo(() => predictRaces(list), [list]);
  const allDist = list.reduce((s, a) => s + a.distance, 0);

  return (
    <>
      <header className="topbar">
        <h1>{t('Profil')}</h1>
        <a className="back" href="#/settings" aria-label={t('Paramètres')}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </a>
      </header>
      <main className="detail">
        <section className="card profile-head">
          <div className="avatar">{(name || 'A')[0].toUpperCase()}</div>
          <div>
            <h2>{name || t('Athlète Allure')}</h2>
            {activities && <p className="muted"><a href="#/activities">{tn(list.length, '{n} activité', '{n} activités')}</a> · {t('{dist} au total', { dist: `${fmtDist(allDist, 0)} ${distUnit()}` })}</p>}
          </div>
        </section>

        {/* Until the list loads: placeholders, not "0 activities" and empty goals. */}
        {!activities && [180, 320].map((h) => <div key={h} className="skeleton" style={{ height: h }} />)}
        {activities && (
          <a className="card link-card" href="#/activities">
            <span><b>{t('Mes activités')}</b><span className="muted">{t('Toutes tes sorties, de la plus récente à la plus ancienne')}</span></span>
            <span aria-hidden="true">›</span>
          </a>
        )}
        {activities && <Goals goals={goals} activities={counted ?? list} onSave={onSaveGoals} />}
        {activities && <Achievements activities={list} />}
        {list.length > 0 && <StreakAndYear activities={list} />}

        {list.length > 0 && (
          <>
            {sportOptions.length > 2 && <Segmented label={t('Sport')} options={sportOptions} value={sport} onChange={setSport} />}
            <section className="card">
              <Segmented label={t('Période')} options={PERIODS} value={period} onChange={setPeriod} />
              <div className="totals">
                <div><span>{t('Activités')}</span><b>{tot.count}</b></div>
                <div><span>{t('Distance')}</span><b>{fmtDist(tot.distance, 1)} <small>{distUnit()}</small></b></div>
                <div><span>{t('Temps')}</span><b>{fmtDuration(tot.movingTime)}</b></div>
                <div><span>{t('Dénivelé')}</span><b>{fmtElev(tot.gain)} <small>{elevUnit()}</small></b></div>
              </div>
              {ytd?.last.count > 0 && <YearToDate {...ytd} />}
            </section>
            <WeeklyChart weeks={weeks} />
            <a className="card link-card" href="#/log">
              <span><b>{t("Journal d'entraînement")}</b><span className="muted">{t('Toutes tes semaines, jour par jour')}</span></span>
              <span aria-hidden="true">›</span>
            </a>
            <FitnessChart activities={counted ?? list} hr={hr} />
            <PowerCurve activities={list} ftp={ftp} />
            <ActivityCalendar activities={list} sport={sport || undefined} />
            <RecordsList activities={list} sport={sport} />
            <SegmentsList segments={segments} activities={list} />
            <RacePredictions predictions={predictions} />
          </>
        )}

        {activities && <Gear gears={gears} activities={list} onSave={onSaveGears} />}
      </main>
    </>
  );
}

/** This year so far against last year at the same date: last year's totals and the change. */
function YearToDate({ current, last }) {
  const delta = (k) => (last[k] ? ` (${current[k] >= last[k] ? '+' : '−'}${Math.round(Math.abs(current[k] / last[k] - 1) * 100)} %)` : '');
  return (
    <p className="muted ytd">
      {t('À la même date l’an dernier : {dist}{d1} · {time}{d2} · {gain}{d3}', {
        dist: `${fmtDist(last.distance, 0)} ${distUnit()}`, d1: delta('distance'),
        time: fmtDuration(last.movingTime), d2: delta('movingTime'),
        gain: `${fmtElev(last.gain)} ${elevUnit()}`, d3: delta('gain'),
      })}
    </p>
  );
}

/** Weekly streak, and the year in sport with a story to share. */
function StreakAndYear({ activities }) {
  const streak = useMemo(() => weekStreak(activities), [activities]);
  const years = useMemo(() => [...new Set(activities.map((a) => new Date(a.date).getFullYear()))].sort((a, b) => b - a), [activities]);
  const [year, setYear] = useState(years[0]);
  const r = useMemo(() => yearRecap(activities, year), [activities, year]);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const [{ drawYearRecap }, { shareFile }] = await Promise.all([import('../lib/story.js'), import('../lib/share.js')]);
      const c = document.createElement('canvas');
      drawYearRecap(c, r);
      await shareFile(await new Promise((ok) => c.toBlob(ok, 'image/png')), `allure-${year}.png`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <h3>{t('Série')} <span className="muted small-label">{t('record : {n}', { n: tn(streak.best, '{n} semaine', '{n} semaines') })}</span></h3>
      <p className="streak"><b>{streak.current}</b> {tn(streak.current, 'semaine d’affilée avec au moins une activité', 'semaines d’affilée avec au moins une activité')}</p>
      <h3 className="year-head">
        {years.length > 1
          ? <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('Année')}>{years.map((y) => <option key={y} value={y}>{t('Mon année {year}', { year: y })}</option>)}</select>
          : t('Mon année {year}', { year })}
      </h3>
      <div className="totals">
        <div><span>{t('Activités')}</span><b>{r.count}</b></div>
        <div><span>{t('Distance')}</span><b>{fmtDist(r.distance, 0)} <small>{distUnit()}</small></b></div>
        <div><span>{t('Temps')}</span><b>{fmtDuration(r.movingTime)}</b></div>
        <div><span>{t('Jours actifs')}</span><b>{r.days}</b></div>
      </div>
      <button type="button" className="ghost" disabled={busy} onClick={share}>{t('Partager mon année')}</button>
    </section>
  );
}

/** The athlete's segments with their best time. Segments are created from an activity. */
function SegmentsList({ segments, activities }) {
  if (!segments.length) return null;
  return (
    <section className="card">
      <h3>{t('Mes segments')} <span className="muted small-label">{segments.length}</span></h3>
      <ul className="records">
        {[...segments].sort((a, b) => a.name.localeCompare(b.name)).map((seg) => {
          const board = leaderboard(seg, activities);
          return (
            <li key={seg.id}>
              <a className="rec-label seg-name" href={`#/segment/${seg.id}`}>{SPORTS[seg.sport]?.icon} {seg.name}</a>
              <a href={`#/segment/${seg.id}`}>
                <b>{board.length ? fmtDuration(board[0].time) : '—'}</b>
                <span className="muted">{fmtDist(seg.distance)} {distUnit()} · {board.length}×</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
