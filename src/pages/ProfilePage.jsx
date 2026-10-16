import { useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import { deleteActivities } from '../lib/db.js';

export default function ProfilePage({ activities = [], onDemo, onChange }) {
  const [busy, setBusy] = useState(false);
  const list = activities ?? [];
  const demoIds = list.filter((a) => a.source === 'demo').map((a) => a.id);
  const km = list.reduce((s, a) => s + a.distance, 0) / 1000;

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
            <p className="muted">{list.length} activités · {km.toFixed(0)} km au total</p>
          </div>
        </section>
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
