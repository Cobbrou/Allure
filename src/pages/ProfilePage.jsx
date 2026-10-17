import { useMemo, useState } from 'react';
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
import { personalRecords, predictRaces } from '../lib/records.js';
import { leaderboard } from '../lib/segments.js';
import { SPORTS, sportOptions as sportOptionsOf } from '../lib/sports.js';
import { periodStart, totals, weeklyDistance } from '../lib/stats.js';

const PERIODS = [
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
  { id: 'all', label: 'Total' },
];

export default function ProfilePage({ activities, hr, ftp, name, goals, onSaveGoals, segments, gears, onSaveGears }) {
  const list = activities ?? [];
  const [sport, setSport] = useState('');
  const [period, setPeriod] = useState('week');

  // Only offer sports the athlete actually has.
  const sportOptions = useMemo(() => sportOptionsOf(list), [list]);
  const t = useMemo(() => totals(list, { from: periodStart(period), sport: sport || undefined }), [list, period, sport]);
  const weeks = useMemo(() => weeklyDistance(list, Date.now(), 12, sport || undefined), [list, sport]);
  const records = useMemo(() => personalRecords(list), [list]);
  const predictions = useMemo(() => predictRaces(list), [list]);
  const allDist = list.reduce((s, a) => s + a.distance, 0);

  return (
    <>
      <header className="topbar">
        <h1>Profil</h1>
        <a className="back" href="#/settings" aria-label="Paramètres">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </a>
      </header>
      <main className="detail">
        <section className="card profile-head">
          <div className="avatar">{(name || 'A')[0].toUpperCase()}</div>
          <div>
            <h2>{name || 'Athlète Allure'}</h2>
            <p className="muted">{list.length} activités · {fmtDist(allDist, 0)} {distUnit()} au total</p>
          </div>
        </section>

        <Goals goals={goals} activities={list} onSave={onSaveGoals} />

        {list.length > 0 && (
          <>
            {sportOptions.length > 2 && <Segmented label="Sport" options={sportOptions} value={sport} onChange={setSport} />}
            <section className="card">
              <Segmented label="Période" options={PERIODS} value={period} onChange={setPeriod} />
              <div className="totals">
                <div><span>Activités</span><b>{t.count}</b></div>
                <div><span>Distance</span><b>{fmtDist(t.distance, 1)} <small>{distUnit()}</small></b></div>
                <div><span>Temps</span><b>{fmtDuration(t.movingTime)}</b></div>
                <div><span>Dénivelé</span><b>{fmtElev(t.gain)} <small>{elevUnit()}</small></b></div>
              </div>
            </section>
            <WeeklyChart weeks={weeks} />
            <a className="card link-card" href="#/log">
              <span><b>Journal d'entraînement</b><span className="muted">Toutes tes semaines, jour par jour</span></span>
              <span aria-hidden="true">›</span>
            </a>
            <FitnessChart activities={list} hr={hr} />
            <PowerCurve activities={list} ftp={ftp} />
            <ActivityCalendar activities={list} sport={sport || undefined} />
            <RecordsList records={records} />
            <SegmentsList segments={segments} activities={list} />
            <RacePredictions predictions={predictions} />
          </>
        )}

        <Gear gears={gears} activities={list} onSave={onSaveGears} />
      </main>
    </>
  );
}

/** The athlete's segments with their best time. Segments are created from an activity. */
function SegmentsList({ segments, activities }) {
  if (!segments.length) return null;
  return (
    <section className="card">
      <h3>Mes segments <span className="muted small-label">{segments.length}</span></h3>
      <ul className="records">
        {[...segments].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((seg) => {
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
