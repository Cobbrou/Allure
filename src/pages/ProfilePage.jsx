import { useEffect, useMemo, useState } from 'react';
import ActivityCalendar from '../components/ActivityCalendar.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import FitnessChart from '../components/FitnessChart.jsx';
import Gear from '../components/Gear.jsx';
import Goals from '../components/Goals.jsx';
import RacePredictions from '../components/RacePredictions.jsx';
import RecordsList from '../components/RecordsList.jsx';
import Segmented from '../components/Segmented.jsx';
import WeeklyChart from '../components/WeeklyChart.jsx';
import { deleteActivities } from '../lib/db.js';
import { fmtDuration } from '../lib/format.js';
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

export default function ProfilePage({ activities, hr, hrSaved, onSaveHr, goals, onSaveGoals, segments, gears, onSaveGears, onDemo, onChange }) {
  const list = activities ?? [];
  const [sport, setSport] = useState('');
  const [period, setPeriod] = useState('week');
  const [busy, setBusy] = useState(false);

  // Only offer sports the athlete actually has.
  const sportOptions = useMemo(() => sportOptionsOf(list), [list]);
  const t = useMemo(() => totals(list, { from: periodStart(period), sport: sport || undefined }), [list, period, sport]);
  const weeks = useMemo(() => weeklyDistance(list, Date.now(), 12, sport || undefined), [list, sport]);
  const records = useMemo(() => personalRecords(list), [list]);
  const predictions = useMemo(() => predictRaces(list), [list]);
  const demoIds = list.filter((a) => a.source === 'demo').map((a) => a.id);
  const allKm = list.reduce((s, a) => s + a.distance, 0) / 1000;

  const generate = async () => {
    setBusy(true);
    try { await onDemo(); } finally { setBusy(false); }
  };
  const clearDemo = async () => {
    await deleteActivities(demoIds);
    onChange();
  };

  return (
    <>
      <header className="topbar"><h1>Profil</h1></header>
      <main className="detail">
        <section className="card profile-head">
          <div className="avatar">A</div>
          <div>
            <h2>Athlète Allure</h2>
            <p className="muted">{list.length} activités · {allKm.toFixed(0)} km au total</p>
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
                <div><span>Distance</span><b>{(t.distance / 1000).toFixed(1)} <small>km</small></b></div>
                <div><span>Temps</span><b>{fmtDuration(t.movingTime)}</b></div>
                <div><span>Dénivelé</span><b>{Math.round(t.gain)} <small>m</small></b></div>
              </div>
            </section>
            <WeeklyChart weeks={weeks} />
            <a className="card link-card" href="#/log">
              <span><b>Journal d'entraînement</b><span className="muted">Toutes tes semaines, jour par jour</span></span>
              <span aria-hidden="true">›</span>
            </a>
            <a className="card link-card" href="#/heatmap">
              <span><b>Carte de chaleur</b><span className="muted">Tous tes tracés sur une seule carte</span></span>
              <span aria-hidden="true">›</span>
            </a>
            <FitnessChart activities={list} hr={hr} />
            <ActivityCalendar activities={list} sport={sport || undefined} />
            <RecordsList records={records} />
            <SegmentsList segments={segments} activities={list} />
            <RacePredictions predictions={predictions} />
          </>
        )}

        <Gear gears={gears} activities={list} onSave={onSaveGears} />
        <HrSettings hr={hr} saved={hrSaved} onSave={onSaveHr} />

        <section className="card">
          <h3>Données de démo</h3>
          <p className="muted">Ajoute 20 sorties variées (course, vélo, rando) sur les 60 derniers jours pour tester l'app.</p>
          <div className="row">
            <button onClick={generate} disabled={busy}>{busy ? 'Génération…' : 'Générer 20 activités'}</button>
            {demoIds.length > 0 && (
              <ConfirmButton onConfirm={clearDemo}>Supprimer la démo ({demoIds.length})</ConfirmButton>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

/** Max and resting heart rate. Empty fields fall back to the estimate from history. */
function HrSettings({ hr, saved, onSave }) {
  const [max, setMax] = useState(saved?.max ?? '');
  const [rest, setRest] = useState(saved?.rest ?? '');
  const [done, setDone] = useState(false);
  useEffect(() => { setMax(saved?.max ?? ''); setRest(saved?.rest ?? ''); }, [saved]);
  const num = (v, lo, hi) => (v === '' ? undefined : Math.min(hi, Math.max(lo, Math.round(Number(v)))));
  const submit = async (e) => {
    e.preventDefault();
    await onSave({ max: num(max, 120, 230), rest: num(rest, 30, 100) });
    setDone(true);
  };
  return (
    <form className="card edit hr-settings" onSubmit={submit}>
      <h3>Fréquence cardiaque</h3>
      <p className="muted">Sert aux zones cardio, à l'effort relatif et à la courbe de forme.</p>
      <div className="row">
        <label>FC max
          <input type="number" inputMode="numeric" min="120" max="230" placeholder={`${hr.max} (estimée)`} value={max}
            onChange={(e) => { setMax(e.target.value); setDone(false); }} />
        </label>
        <label>FC repos
          <input type="number" inputMode="numeric" min="30" max="100" placeholder={String(hr.rest)} value={rest}
            onChange={(e) => { setRest(e.target.value); setDone(false); }} />
        </label>
      </div>
      <div className="row"><button type="submit">{done ? 'Enregistré ✓' : 'Enregistrer'}</button></div>
    </form>
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
                <span className="muted">{(seg.distance / 1000).toFixed(2)} km · {board.length}×</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
