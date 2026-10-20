import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import ActivityCard from '../components/ActivityCard.jsx';
import ImportButton from '../components/ImportButton.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import { usePullToRefresh } from '../gestures.js';
import { analyze } from '../lib/analyze.js';
import { getActivity, getPhotos } from '../lib/db.js';

const PAGE = 30; // cards rendered per scroll step: a big archive doesn't mount every card

export default function FeedPage({ activities, zones, onRefresh, onImport, onDemo }) {
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(null); // { act: analyzed activity, photos } in the share sheet
  const share = async (id) => {
    const [d, photos] = await Promise.all([getActivity(id), getPhotos(id).catch(() => [])]);
    if (d) setShared({ act: { ...analyze(d.points, d.meta.sport), ...d.meta }, photos });
  };
  const ptr = usePullToRefresh(onRefresh);
  const [shown, setShown] = useState(PAGE);
  const more = useRef();
  // Re-observed after each page, so a sentinel still in view loads the next one too.
  useEffect(() => {
    if (!more.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + PAGE), { rootMargin: '600px' });
    io.observe(more.current);
    return () => io.disconnect();
  }, [shown, activities]);
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
      {!activities && (
        <main className="feed" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 380 }} />)}</main>
      )}
      {activities?.length > 0 && (
        <main className="feed">
          {activities.slice(0, shown).map((a, i) => <ActivityCard key={a.id} a={a} i={i} onShare={share} />)}
          {shown < activities.length && <div ref={more} aria-hidden="true" />}
        </main>
      )}
      {/* Keyed by activity: a photo picked for one share must never become another's background. */}
      <ShareSheet key={shared?.act.id} act={shared?.act} zones={zones} photos={shared?.photos} open={!!shared} onClose={() => setShared(null)} />
    </>
  );
}
