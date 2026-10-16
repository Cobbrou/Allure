import { useState } from 'react';
import ActivityCard from '../components/ActivityCard.jsx';
import ImportButton from '../components/ImportButton.jsx';

export default function FeedPage({ activities, onImport, onDemo }) {
  const [busy, setBusy] = useState(false);
  const demo = async () => {
    setBusy(true);
    try { await onDemo(); } finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar">
        <div className="logo"><span>▲</span> Allure</div>
        <ImportButton onImport={onImport} className="button ghost small">+ Importer</ImportButton>
      </header>
      {activities && !activities.length && (
        <div className="empty">
          <div className="drop-icon">⤓</div>
          <h2>Aucune activité pour l'instant</h2>
          <p>Importe un fichier .gpx (Strava, Garmin, Coros…) ou génère un historique pour essayer l'app.</p>
          <ImportButton onImport={onImport} />
          <button type="button" className="ghost" onClick={demo} disabled={busy}>
            {busy ? 'Génération…' : 'Générer un historique de démo'}
          </button>
        </div>
      )}
      {activities?.length > 0 && (
        <main className="feed">
          {activities.map((a, i) => <ActivityCard key={a.id} a={a} i={i} />)}
        </main>
      )}
    </>
  );
}
