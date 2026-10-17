import { useState } from 'react';
import ActivityCard from '../components/ActivityCard.jsx';
import ImportButton from '../components/ImportButton.jsx';
import { analyze } from '../lib/analyze.js';
import { getActivity } from '../lib/db.js';
import { exportStory } from '../lib/story.js';

/** Share an activity as a story image, from its stored track. */
async function share(id) {
  const d = await getActivity(id);
  if (d) await exportStory({ ...analyze(d.points), ...d.meta });
}

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
          <p>Importe tes sorties (.gpx, .tcx, .fit) ou ton archive Strava complète (.zip), ou génère un historique pour essayer l'app.</p>
          <ImportButton onImport={onImport} />
          <button type="button" className="ghost" onClick={demo} disabled={busy}>
            {busy ? 'Génération…' : 'Générer un historique de démo'}
          </button>
        </div>
      )}
      {activities?.length > 0 && (
        <main className="feed">
          {activities.map((a, i) => <ActivityCard key={a.id} a={a} i={i} onShare={share} />)}
        </main>
      )}
    </>
  );
}
