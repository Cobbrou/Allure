import { t, tn } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import ActivityCard from '../components/ActivityCard.jsx';
import ImportButton from '../components/ImportButton.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import { usePullToRefresh } from '../gestures.js';
import { analyze } from '../lib/analyze.js';
import { getActivity, getPhotos } from '../lib/db.js';
import { distLen, distUnit, fromInput, parseNum } from '../lib/format.js';
import { sportOptions } from '../lib/sports.js';
import { filterActivities, startOfDay } from '../lib/stats.js';
import { back } from '../router.js';

const PAGE = 30; // cards rendered per scroll step: a big archive doesn't mount every card

/** `#/activities`: every activity, newest first, opened from the profile. */
export default function FeedPage({ activities, name, zones, onRefresh, onImport, onDemo }) {
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(null); // { act: analyzed activity, photos } in the share sheet
  const share = async (id) => {
    const [d, photos] = await Promise.all([getActivity(id), getPhotos(id).catch(() => [])]);
    if (d) setShared({ act: { ...analyze(d.points, d.meta.sport), ...d.meta }, photos });
  };
  const ptr = usePullToRefresh(onRefresh);
  const [shown, setShown] = useState(PAGE);
  const [f, setF] = useState({ q: '', sport: '', from: '', to: '', min: '', max: '' }); // search and filters, as typed
  const [open, setOpen] = useState(false);
  const set = (patch) => { setF({ ...f, ...patch }); setShown(PAGE); };
  const km = (v) => (v === '' || !Number.isFinite(parseNum(v)) ? null : parseNum(v) * distLen());
  const filtered = !!(f.q.trim() || f.sport || f.from || f.to || f.min || f.max);
  const list = useMemo(() => activities && (filtered
    ? filterActivities(activities, { q: f.q, sport: f.sport, from: f.from ? fromInput(f.from) : null, to: f.to ? startOfDay(fromInput(f.to) + 30 * 3600e3) : null, min: km(f.min), max: km(f.max) })
    : activities), [activities, f]);
  const more = useRef();
  // Re-observed after each page, so a sentinel still in view loads the next one too.
  useEffect(() => {
    if (!more.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + PAGE), { rootMargin: '600px' });
    io.observe(more.current);
    return () => io.disconnect();
  }, [shown, list]);
  const demo = async () => {
    setBusy(true);
    try { await onDemo(); } finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar">
        <a className="back" href="#/profile" aria-label={t('Retour au profil')} onClick={(e) => { e.preventDefault(); back('/profile'); }}>‹</a>
        <h1>{t('Mes activités')}</h1>
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
          <section className="feed-search">
            <div className="search-row">
              <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={t('Rechercher une activité')} aria-label={t('Rechercher une activité')} />
              <button type="button" className={`ghost small ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>{t('Filtres')}</button>
            </div>
            {open && (
              <div className="edit filters">
                <label>{t('Sport')}
                  <select value={f.sport} onChange={(e) => set({ sport: e.target.value })}>
                    {sportOptions(activities).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
                <div className="field-pair">
                  <label>{t('Du')}<input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
                  <label>{t('Au')}<input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
                </div>
                <div className="field-pair">
                  <label>{t('Min ({unit})', { unit: distUnit() })}<input inputMode="decimal" value={f.min} onChange={(e) => set({ min: e.target.value })} /></label>
                  <label>{t('Max ({unit})', { unit: distUnit() })}<input inputMode="decimal" value={f.max} onChange={(e) => set({ max: e.target.value })} /></label>
                </div>
              </div>
            )}
            {filtered && (
              <p className="muted small-label">
                {tn(list.length, '{n} activité', '{n} activités')} · <button type="button" className="ghost small" onClick={() => set({ q: '', sport: '', from: '', to: '', min: '', max: '' })}>{t('Effacer')}</button>
              </p>
            )}
          </section>
          {list.slice(0, shown).map((a, i) => <ActivityCard key={a.id} a={a} i={i} name={name} onShare={share} />)}
          {shown < list.length && <div ref={more} aria-hidden="true" />}
        </main>
      )}
      {/* Keyed by activity: a photo picked for one share must never become another's background. */}
      <ShareSheet key={shared?.act.id} act={shared?.act} zones={zones} photos={shared?.photos} open={!!shared} onClose={() => setShared(null)} />
    </>
  );
}
