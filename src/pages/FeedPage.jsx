import { t } from '../lib/i18n.js';
import { useState } from 'react';
import ActivityCard from '../components/ActivityCard.jsx';
import ImportButton from '../components/ImportButton.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import { usePullToRefresh } from '../gestures.js';
import { analyze } from '../lib/analyze.js';
import { getActivity } from '../lib/db.js';

export default function FeedPage({ activities, zones, onRefresh, onImport, onDemo }) {
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(null); // analyzed activity in the share sheet
  const share = async (id) => {
    const d = await getActivity(id);
    if (d) setShared({ ...analyze(d.points), ...d.meta });
  };
  const ptr = usePullToRefresh(onRefresh);
  const demo = async () => {
    setBusy(true);
    try { await onDemo(); } finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar">
        <div className="logo"><span>▲</span> Allure</div>
        <ImportButton onImport={onImport} className="button ghost small">{t('+ Importer')}</ImportButton>
      </header>
      {activities && !activities.length && (
        <div className="empty">
          <div className="drop-icon">⤓</div>
          <h2>{t("Aucune activité pour l'instant")}</h2>
          <p>{t("Importe tes sorties (.gpx, .tcx, .fit) ou ton archive Strava complète (.zip), ou génère un historique pour essayer l'app.")}</p>
          <ImportButton onImport={onImport} />
          <button type="button" className="ghost" onClick={demo} disabled={busy}>
            {t(busy ? 'Génération…' : 'Générer un historique de démo')}
          </button>
        </div>
      )}
      <div className={`ptr ${ptr.ready ? 'ready' : ''} ${ptr.busy ? 'busy' : ''}`} style={{ height: ptr.pull }} aria-hidden={!ptr.busy}>
        <span className="ptr-icon" style={{ '--r': `${ptr.pull * 3}deg` }}>↻</span>
      </div>
      {activities?.length > 0 && (
        <main className="feed">
          {activities.map((a, i) => <ActivityCard key={a.id} a={a} i={i} onShare={share} />)}
        </main>
      )}
      <ShareSheet act={shared} zones={zones} open={!!shared} onClose={() => setShared(null)} />
    </>
  );
}
