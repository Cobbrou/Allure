import { t, tn } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibre, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Same Vite worker fix as TrackMap.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import RoutePreview from '../components/RoutePreview.jsx';
import Segmented from '../components/Segmented.jsx';
import { forEachTrack } from '../lib/db.js';
import { distUnit, elevUnit, fmtDist, fmtElev } from '../lib/format.js';
import { homeLines, thin } from '../lib/heatmap.js';
import { sportOptions, SPORTS } from '../lib/sports.js';
import { MAP_STYLE } from '../lib/offline.js';
import { ACCENT, mapLocale } from '../theme.js';

setWorkerUrl(workerUrl);

/** Maps tab: personal heatmap (every track drawn faintly, so the routes you repeat glow brighter) and routes. */
export default function MapsPage({ activities, routes }) {
  const list = activities ?? [];
  const [lines, setLines] = useState(null); // [{ sport, coords }]
  const [sport, setSport] = useState('');
  const options = useMemo(() => sportOptions(list), [list]);

  useEffect(() => {
    if (!activities) return;
    const sportOf = new Map(activities.map((a) => [a.id, a.sport]));
    const out = [];
    forEachTrack((id, points) => {
      if (sportOf.has(id) && points?.length > 1) out.push({ sport: sportOf.get(id), coords: thin(points) });
    }).then(() => setLines(out), () => setLines([]));
  }, [activities]);

  const shown = useMemo(() => lines?.filter((l) => !sport || l.sport === sport), [lines, sport]);

  return (
    <>
      <header className="topbar"><h1>{t('Cartes')}</h1></header>
      <main className="detail">
        <h2 className="section-title">{t('Carte de chaleur')}</h2>
        {options.length > 2 && <Segmented label={t('Sport')} options={options} value={sport} onChange={setSport} />}
        {shown === undefined ? <div className="skeleton heatmap" />
          : shown.length ? <section className="card map-card"><HeatMap lines={shown} /></section>
          : <p className="empty">{t('Aucun tracé GPS à afficher.')}</p>}
        {shown?.length > 0 && <p className="muted small-label">{tn(shown.length, '{n} activité', '{n} activités')} · {t('deux doigts pour zoomer')}</p>}
        <h2 className="section-title">{t('Itinéraires')}</h2>
        <a className="card link-card" href="#/route/new">
          <span><b>{t('Créer un itinéraire')}</b><span className="muted">{t('Trace ton parcours, collé aux routes et sentiers')}</span></span>
          <span aria-hidden="true">›</span>
        </a>
        {routes?.map((r) => (
          <a key={r.id} className="card link-card route-card" href={`#/route/${r.id}`}>
            <RoutePreview coords={r.preview} />
            <span>
              <b>{SPORTS[r.sport]?.icon} {r.name}</b>
              <span className="muted">{fmtDist(r.distance, 1)} {distUnit()}{r.gain != null && ` · ${fmtElev(r.gain)} ${elevUnit()} D+`}</span>
            </span>
            <span aria-hidden="true">›</span>
          </a>
        ))}
        <a className="card link-card" href="#/suggest">
          <span><b>{t("Idées d'itinéraires")}</b><span className="muted">{t('Des boucles proposées selon ta distance, ton dénivelé et tes envies')}</span></span>
          <span aria-hidden="true">›</span>
        </a>
      </main>
    </>
  );
}

function HeatMap({ lines }) {
  const el = useRef();
  const map = useRef();
  const data = useMemo(() => ({
    type: 'FeatureCollection',
    // One feature per activity: overlapping features add up their opacity, a single feature would not.
    features: lines.map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l.coords } })),
  }), [lines]);
  const bounds = useMemo(() => {
    const all = homeLines(lines).flatMap((l) => l.coords);
    return all.reduce((b, c) => b.extend(c), new LngLatBounds(all[0], all[0]));
  }, [lines]);

  useEffect(() => {
    const m = new MapLibre({ container: el.current, style: MAP_STYLE, locale: mapLocale(), bounds, fitBoundsOptions: { padding: 30 }, cooperativeGestures: true });
    m.on('load', () => {
      el.current?.classList.add('ready');
      m.addSource('heat', { type: 'geojson', data });
      const width = (k) => ['interpolate', ['linear'], ['zoom'], 8, 1 * k, 16, 4 * k];
      m.addLayer({ id: 'heat-glow', type: 'line', source: 'heat', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': width(4), 'line-blur': width(3), 'line-opacity': 0.12 } });
      m.addLayer({ id: 'heat', type: 'line', source: 'heat', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffb38a', 'line-width': width(1), 'line-opacity': 0.35 } });
    });
    map.current = m;
    return () => m.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- created once, updated below

  useEffect(() => {
    const m = map.current;
    if (!m.getSource('heat')) return;
    m.getSource('heat').setData(data);
    m.fitBounds(bounds, { padding: 30 });
  }, [data, bounds]);

  return <div ref={el} className="map heatmap" />;
}

