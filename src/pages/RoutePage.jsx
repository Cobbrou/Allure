import { locale, t } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GeolocateControl, LngLatBounds, Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Same Vite worker fix as TrackMap.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import ConfirmButton from '../components/ConfirmButton.jsx';
import ProfileChart from '../components/ProfileChart.jsx';
import Segmented from '../components/Segmented.jsx';
import Terrain3D from '../components/Terrain3D.js';
import { analyze } from '../lib/analyze.js';
import { distUnit, elevUnit, fmtDist, fmtElev } from '../lib/format.js';
import { toGpx } from '../lib/formats/gpxExport.js';
import { createRoute, fetchLeg, joinLegs, legKey, straightLeg } from '../lib/routes.js';
import { safeName, shareFile } from '../lib/share.js';
import { SPORTS } from '../lib/sports.js';
import { back } from '../router.js';
import { getRoute } from '../lib/db.js';
import { downloadRoute, MAP_STYLE, offlineInfo, removeOffline } from '../lib/offline.js';
import { ACCENT, mapLocale } from '../theme.js';

setWorkerUrl(workerUrl);

const sportOptions = () => ['run', 'ride', 'hike', 'walk'].map((id) => ({ id, label: `${SPORTS[id].icon} ${SPORTS[id].label}` }));
const snapOptions = () => [{ id: true, label: t('Suivre les chemins') }, { id: false, label: t('Ligne droite') }];
const FALLBACK_CENTER = [6.8696, 45.9237]; // Chamonix, where the demo history lives

/** Route builder: tap the map to add waypoints, drag them to adjust. `id` is 'new' or a saved route. */
export default function RoutePage({ id, activities, onSave, onDelete }) {
  // The route with its points (the app keeps metas only): undefined while loading, null if none.
  const [saved, setSaved] = useState(id === 'new' ? null : undefined);
  useEffect(() => {
    if (id === 'new') { setSaved(null); return; }
    setSaved(undefined);
    getRoute(id).then((r) => setSaved(r ?? null), () => setSaved(null));
  }, [id]);
  const top = (
    <header className="topbar">
      <a className="back" href="#/maps" aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back('/maps'); }}>‹</a>
      <h1>{t(saved ? 'Itinéraire' : 'Nouvel itinéraire')}</h1>
      <span className="back" aria-hidden="true" />
    </header>
  );
  if (saved === undefined) return top;
  if (id !== 'new' && !saved) return (<>{top}<p className="empty">{t('Itinéraire introuvable.')}</p></>);
  return (<>{top}<Builder key={id} saved={saved} activities={activities} onSave={onSave} onDelete={onDelete} /></>);
}

function Builder({ saved, activities, onSave, onDelete }) {
  const [name, setName] = useState(saved?.name ?? t('Nouvel itinéraire'));
  const [sport, setSport] = useState(saved?.sport ?? 'run');
  const [snap, setSnap] = useState(saved?.snap ?? true);
  const [waypoints, setWaypoints] = useState(saved?.waypoints ?? []);
  // Routed legs by legKey, seeded with the saved ones; 'error' falls back to a straight line.
  const [legCache, setLegCache] = useState(() => Object.fromEntries(
    saved?.legs.map((leg, i) => [legKey(saved.waypoints[i], saved.waypoints[i + 1], saved.sport, saved.snap), leg]) ?? []));
  const inFlight = useRef(new Set());
  const [busy, setBusy] = useState(false);
  const hover = useRef(() => {});

  const keys = waypoints.slice(1).map((b, i) => legKey(waypoints[i], b, sport, snap));
  const missing = snap ? keys.filter((k) => !legCache[k]) : [];
  const legs = keys.map((k, i) => (Array.isArray(legCache[k]) ? legCache[k] : straightLeg(waypoints[i], waypoints[i + 1])));
  const failed = keys.some((k) => legCache[k] === 'error');

  useEffect(() => {
    if (!snap) return;
    waypoints.slice(1).forEach((b, i) => {
      const a = waypoints[i], k = legKey(a, b, sport, snap);
      if (legCache[k] || inFlight.current.has(k)) return;
      inFlight.current.add(k);
      fetchLeg(a, b, sport)
        .catch(() => 'error')
        .then((leg) => { inFlight.current.delete(k); setLegCache((c) => ({ ...c, [k]: leg })); });
    });
  }, [waypoints, sport, snap, legCache]);

  const points = useMemo(() => joinLegs(legs), [keys.join(), legCache]); // eslint-disable-line react-hooks/exhaustive-deps -- legs derive from both
  const stats = useMemo(() => (points.length > 1 ? analyze(points) : null), [points]);

  const center = waypoints[0] ?? activities?.find((a) => a.preview?.length)?.preview[0] ?? FALLBACK_CENTER;
  const save = async () => {
    setBusy(true);
    try {
      // A new path makes the downloaded map corridor stale.
      if (saved && keys.join() !== saved.waypoints.slice(1).map((b, i) => legKey(saved.waypoints[i], b, saved.sport, saved.snap)).join()) await removeOffline(saved.id);
      await onSave(createRoute({ id: saved?.id, created: saved?.created, name: name.trim() || t('Itinéraire'), sport, snap, waypoints, legs }));
    } finally { setBusy(false); }
  };
  const exportGpx = () => {
    const meta = { name: name.trim() || t('Itinéraire'), sport, date: saved?.created ?? Date.now() };
    shareFile(new Blob([toGpx(meta, points)], { type: 'application/gpx+xml' }), `${safeName(meta.name)}.gpx`);
  };

  return (
    <main className="detail">
      <section className="card map-card">
        <BuilderMap
          center={center}
          fit={saved?.waypoints}
          waypoints={waypoints}
          points={points}
          hover={hover}
          onAdd={(p) => setWaypoints((w) => [...w, p])}
          onMove={(i, p) => setWaypoints((w) => w.map((q, j) => (j === i ? p : q)))}
        />
      </section>
      <p className="muted small-label">
        {t(waypoints.length ? 'Touche la carte pour prolonger, fais glisser un point pour le déplacer' : 'Touche la carte pour placer le départ')}
        {missing.length > 0 && t(' · calcul…')}
        {failed && t(' · routage indisponible, tronçon en ligne droite')}
      </p>
      <div className="row route-tools">
        <button type="button" className="ghost" disabled={!waypoints.length} onClick={() => setWaypoints((w) => w.slice(0, -1))}>{t('Annuler')}</button>
        <button type="button" className="ghost" disabled={waypoints.length < 2} onClick={() => setWaypoints((w) => [...w, w[0]])}>{t('Boucler')}</button>
        <button type="button" className="ghost" disabled={!waypoints.length} onClick={() => setWaypoints([])}>{t('Effacer')}</button>
      </div>
      <Segmented label={t('Tracé')} options={snapOptions()} value={snap} onChange={setSnap} />
      <Segmented label={t('Sport')} options={sportOptions()} value={sport} onChange={setSport} />

      {stats && (
        <section className="card">
          <div className="totals seg-totals">
            <div><span>{t('Distance')}</span><b>{fmtDist(stats.distance)} <small>{distUnit()}</small></b></div>
            <div><span>{t('Dénivelé')}</span><b>{stats.gain != null ? fmtElev(stats.gain) : '—'} <small>{elevUnit()}</small></b></div>
            <div><span>{t('Points')}</span><b>{waypoints.length}</b></div>
          </div>
          {stats.gain != null && <ProfileChart track={stats.track} hover={hover} />}
        </section>
      )}

      {saved && <OfflineCard route={saved} />}

      <section className="card edit">
        <label>{t('Nom')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
        <div className="row">
          <button type="button" onClick={save} disabled={busy || waypoints.length < 2 || missing.length > 0}>
            {t(busy ? 'Enregistrement…' : "Enregistrer l'itinéraire")}
          </button>
          {saved && <a className="button ghost" href={`#/record/${saved.id}`}>{t('Suivre')}</a>}
          {points.length > 1 && <button type="button" className="ghost" onClick={exportGpx}>{t('Exporter .gpx')}</button>}
          {saved && <ConfirmButton onConfirm={() => { removeOffline(saved.id); onDelete(saved.id); }}>{t('Supprimer')}</ConfirmButton>}
        </div>
      </section>
    </main>
  );
}

/** Download a saved route's map (corridor tiles) so it can be followed without a network. */
function OfflineCard({ route }) {
  const [info, setInfo] = useState();
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { offlineInfo(route.id).then(setInfo, () => setInfo(null)); }, [route.id]);

  const download = async () => {
    setError(false);
    setProgress(0);
    try {
      setInfo(await downloadRoute(route, joinLegs(route.legs), (done, total) => setProgress(done / total)));
    } catch {
      setError(true);
    } finally { setProgress(null); }
  };
  const remove = async () => { await removeOffline(route.id); setInfo(null); };

  return (
    <section className="card edit offline">
      <h3>{t('Hors ligne')}</h3>
      {progress != null ? (
        <>
          <p className="muted">{t('Téléchargement de la carte… {n} %', { n: Math.round(progress * 100) })}</p>
          <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
        </>
      ) : info ? (
        <>
          <p className="muted">{t('✓ Carte disponible sans réseau · {n} Mo', { n: (info.bytes / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })}</p>
          <ConfirmButton onConfirm={remove}>{t('Retirer la carte')}</ConfirmButton>
        </>
      ) : (
        <>
          <p className="muted">{t(error ? 'Téléchargement impossible, vérifie ta connexion.' : 'Enregistre la carte autour du parcours pour le suivre sans réseau.')}</p>
          <button type="button" className="ghost" onClick={download} disabled={info === undefined}>{t('Télécharger la carte')}</button>
        </>
      )}
    </section>
  );
}

const lineData = (points) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) } });
const round = (v) => Math.round(v * 1e6) / 1e6;

/** Editable map: a tap calls onAdd([lon, lat]), dragging waypoint i calls onMove(i, [lon, lat]). */
function BuilderMap({ center, fit, waypoints, points, hover, onAdd, onMove }) {
  const el = useRef();
  const map = useRef();
  const markers = useRef([]);
  const cb = useRef();
  cb.current = { onAdd, onMove };

  useEffect(() => {
    // No cooperativeGestures: the map is the editing surface, so one finger pans it.
    const m = new MapLibre({ container: el.current, style: MAP_STYLE, locale: mapLocale(), center, zoom: 13 });
    if (fit?.length > 1) m.fitBounds(fit.reduce((b, c) => b.extend(c), new LngLatBounds(fit[0], fit[0])), { padding: 40, duration: 0 });
    m.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');
    m.on('load', () => {
      el.current?.classList.add('ready');
      m.addSource('route', { type: 'geojson', data: lineData([]) });
      m.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': 12, 'line-blur': 8, 'line-opacity': 0.5 } });
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': 4 } });
      m.addControl(new Terrain3D(), 'top-right');
      m.fire('routedata');
    });
    m.on('click', (e) => cb.current.onAdd([round(e.lngLat.lng), round(e.lngLat.lat)]));
    map.current = m;
    return () => { hover.current = () => {}; m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once, updated below
  }, []);

  useEffect(() => {
    const m = map.current;
    const draw = () => m.getSource('route')?.setData(lineData(points));
    draw();
    m.on('routedata', draw);
    const cursor = new Marker({ element: Object.assign(document.createElement('div'), { className: 'pin cursor' }) });
    hover.current = (i) => (i == null || !points[i] ? cursor.remove() : cursor.setLngLat([points[i].lon, points[i].lat]).addTo(m));
    return () => { m.off('routedata', draw); cursor.remove(); };
  }, [points, hover]);

  useEffect(() => {
    markers.current.forEach((mk) => mk.remove());
    markers.current = waypoints.map((p, i) => {
      const cls = i === 0 ? 'start' : i === waypoints.length - 1 ? 'finish' : 'via';
      const mk = new Marker({ element: Object.assign(document.createElement('div'), { className: `pin ${cls}` }), draggable: true })
        .setLngLat(p).addTo(map.current);
      mk.on('dragend', () => { const { lng, lat } = mk.getLngLat(); cb.current.onMove(i, [round(lng), round(lat)]); });
      return mk;
    });
  }, [waypoints]);

  return <div ref={el} className="map builder" />;
}
