import { useMemo, useState } from 'react';
import ActivityCalendar from '../components/ActivityCalendar.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import RecordsList from '../components/RecordsList.jsx';
import Segmented from '../components/Segmented.jsx';
import WeeklyChart from '../components/WeeklyChart.jsx';
import { deleteActivities } from '../lib/db.js';
import { fmtDuration } from '../lib/format.js';
import { personalRecords } from '../lib/records.js';
import { SPORTS } from '../lib/sports.js';
import { periodStart, totals, weeklyDistance } from '../lib/stats.js';

const PERIODS = [
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
  { id: 'all', label: 'Total' },
];

export default function ProfilePage({ activities, onDemo, onChange }) {
  const list = activities ?? [];
  const [sport, setSport] = useState('');
  const [period, setPeriod] = useState('week');
  const [busy, setBusy] = useState(false);

  // Only offer sports the athlete actually has.
  const sportOptions = useMemo(() => {
    const present = new Set(list.map((a) => a.sport));
    return [{ id: '', label: 'Tous' }, ...Object.entries(SPORTS).filter(([id]) => present.has(id)).map(([id, s]) => ({ id, label: `${s.icon} ${s.label}` }))];
  }, [list]);
  const t = useMemo(() => totals(list, { from: periodStart(period), sport: sport || undefined }), [list, period, sport]);
  const weeks = useMemo(() => weeklyDistance(list, Date.now(), 12, sport || undefined), [list, sport]);
  const records = useMemo(() => personalRecords(list), [list]);
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
            <ActivityCalendar activities={list} sport={sport || undefined} />
            <RecordsList records={records} />
          </>
        )}

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
