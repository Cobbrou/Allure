import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Same Vite worker fix as TrackMap.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import RoutePreview from '../components/RoutePreview.jsx';
import Terrain3D from '../components/Terrain3D.js';
import { getSetting, setSetting, thinTracks } from '../lib/db.js';
import { distUnit, elevUnit, fmtDist, fmtElev } from '../lib/format.js';
import { homeLines } from '../lib/heatmap.js';
import { watchPosition } from '../lib/location.js';
import { nearestFirst } from '../lib/routes.js';
import { sportOptions, SPORTS } from '../lib/sports.js';
import { FALLBACK_START } from '../lib/suggest.js';
import { mapStyle } from '../lib/offline.js';
import { ACCENT, HEAT, mapLocale, ROUTE } from '../theme.js';

setWorkerUrl(workerUrl);

const SLIDE_GAP = 10; // px between carousel cards, = .map-carousel gap

/**
 * Maps tab: full-screen map around the athlete, moved with one finger. Saved routes, nearest
 * first, sit in a bottom carousel: swiping it highlights a route, tapping one on the map
 * brings its card. The personal heatmap (every track drawn faintly) is a layer to toggle.
 */
export default function MapsPage({ activities, routes }) {
  const list = activities ?? [];
  const [lines, setLines] = useState(null); // [{ sport, coords }]
  const [sport, setSport] = useState('');
  const [heat, setHeat] = useState(true);
  const [pos, setPos] = useState(null); // [lon, lat]
  const [origin, setOrigin] = useState(null); // first fix: routes are sorted from it, so the carousel doesn't reshuffle as you walk
  const [gpsError, setGpsError] = useState(null);
  const [index, setIndex] = useState(0);
  const [focus, setFocus] = useState(null); // route to fit the map on, after a swipe
  const carousel = useRef();
  const options = useMemo(() => sportOptions([...list, ...(routes ?? [])]), [list, routes]);

  const [last, setLast] = useState(null); // last known position: the map opens on it before the first fix

  useEffect(() => {
    getSetting('lastPos').then(setLast, () => {});
    let saved = false;
    return watchPosition((f) => {
      setPos([f.lon, f.lat]);
      setOrigin((o) => o ?? [f.lon, f.lat]);
      setGpsError(null);
      if (!saved) {
        saved = true;
        setSetting('lastPos', [f.lon, f.lat]).catch(() => {});
      }
    }, setGpsError, { maxAge: 60000 });
  }, []);

  useEffect(() => {
    if (!activities) return;
    thinTracks(activities).then(setLines, () => setLines([]));
  }, [activities]);

  const heatLines = useMemo(() => lines?.filter((l) => !sport || l.sport === sport), [lines, sport]);
  const shown = useMemo(() => {
    const r = (routes ?? []).filter((x) => x.preview?.length > 1 && (!sport || x.sport === sport));
    return origin ? nearestFirst(r, origin) : r;
  }, [routes, sport, origin]);

  useEffect(() => {
    setIndex(0);
    carousel.current?.scrollTo({ left: 0 });
  }, [sport]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / (el.firstElementChild.offsetWidth + SLIDE_GAP));
    if (i === index || !shown[i]) return;
    setIndex(i);
    setFocus(shown[i]);
  };
  const pick = (id) => carousel.current.children[shown.findIndex((r) => r.id === id)]
    ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });

  const start = origin ?? list.find((a) => a.preview?.length)?.preview[0] ?? FALLBACK_START;
  return (
    <main className="explore">
      <ExploreMap start={start} last={last} pos={pos} heat={heat ? heatLines : null} routes={shown} picked={shown[index]?.id} focus={focus} onPick={pick} />
      <div className="explore-top">
        <div className="map-search">
          <label className="map-sport">
            <span aria-hidden="true">{SPORTS[sport]?.icon ?? '🗺️'}</span>
            <select aria-label={t('Sport')} value={sport} onChange={(e) => setSport(e.target.value)}>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <a href="#/suggest">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            {t('Trouver un itinéraire')}
          </a>
        </div>
        <button type="button" className="map-filter" aria-pressed={heat} onClick={() => setHeat(!heat)}>{t('Chaleur')}</button>
        {gpsError && <p className="map-alert" role="status"><span aria-hidden="true">i</span>{gpsError}</p>}
      </div>
      <div className="map-carousel" ref={carousel} onScroll={onScroll}>
        {shown.map((r, i) => (
          <a key={r.id} className={`card link-card route-card${i === index ? ' on' : ''}`} href={`#/route/${r.id}`}>
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
        <a className="card link-card" href="#/route/new">
          <span><b>{t('Créer un itinéraire')}</b><span className="muted">{t('Trace ton parcours, collé aux routes et sentiers')}</span></span>
          <span aria-hidden="true">›</span>
        </a>
      </div>
    </main>
  );
}

const lineFeatures = (items, coords, props = () => ({})) => ({
  type: 'FeatureCollection',
  // One feature per line: overlapping heatmap features add up their opacity, a single feature would not.
  features: items.map((x) => ({ type: 'Feature', properties: props(x), geometry: { type: 'LineString', coordinates: coords(x) } })),
});
const boundsOf = (coords) => coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
const FIT = { top: 120, bottom: 140, left: 30, right: 70 }; // clear of the floating controls and the carousel

/** The map itself. last: last known position, to open on; heat: heatmap lines, or null when hidden; picked: highlighted route id; focus: route to fit on. */
function ExploreMap({ start, last, pos, heat, routes, picked, focus, onPick }) {
  const el = useRef();
  const map = useRef();
  const me = useRef();
  const threeD = useRef();
  const moved = useRef(false); // the athlete panned: stop auto-centering
  const placed = useRef(false); // centered on the athlete (live or last known): no heatmap fit
  const cb = useRef();
  cb.current = onPick;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // No cooperativeGestures: the map fills the screen, nothing to scroll, so one finger pans it.
    const m = new MapLibre({ container: el.current, style: mapStyle(), locale: mapLocale(), center: start, zoom: 12 });
    m.on('dragstart', () => { moved.current = true; });
    m.on('load', () => {
      el.current?.classList.add('ready');
      const round = { 'line-join': 'round', 'line-cap': 'round' };
      const width = (k) => ['interpolate', ['linear'], ['zoom'], 8, 1 * k, 16, 4 * k];
      m.addSource('heat', { type: 'geojson', data: lineFeatures([], () => []) });
      m.addLayer({ id: 'heat-glow', type: 'line', source: 'heat', layout: round,
        paint: { 'line-color': ACCENT, 'line-width': width(4), 'line-blur': width(3), 'line-opacity': 0.12 } });
      m.addLayer({ id: 'heat', type: 'line', source: 'heat', layout: round,
        paint: { 'line-color': HEAT, 'line-width': width(1), 'line-opacity': 0.35 } });
      m.addSource('routes', { type: 'geojson', data: lineFeatures([], () => []) });
      const on = ['==', ['get', 'id'], ['literal', '']]; // replaced by the picked id below
      m.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: round, paint: { 'line-color': ROUTE, 'line-width': 4, 'line-opacity': 0.7 } });
      m.addLayer({ id: 'route-on', type: 'line', source: 'routes', layout: round, filter: on, paint: { 'line-color': ACCENT, 'line-width': 6 } });
      // Wide invisible line: a finger-sized target to tap a route.
      m.addLayer({ id: 'routes-hit', type: 'line', source: 'routes', layout: round, paint: { 'line-color': ROUTE, 'line-width': 24, 'line-opacity': 0 } });
      m.on('click', 'routes-hit', (e) => cb.current(e.features[0].properties.id));
      // The 3D button joins the floating column instead of a map corner.
      threeD.current.replaceChildren(new Terrain3D().onAdd(m));
      setReady(true);
    });
    me.current = new Marker({ element: Object.assign(document.createElement('div'), { className: 'pin me' }) });
    map.current = m;
    return () => m.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- created once, updated below

  useEffect(() => {
    const m = map.current;
    if (!ready) return;
    m.getSource('heat').setData(lineFeatures(heat ?? [], (l) => l.coords));
    // No position yet: open on the home area of the heatmap instead.
    if (heat?.length && !placed.current && !moved.current) m.fitBounds(boundsOf(homeLines(heat).flatMap((l) => l.coords)), { padding: FIT, duration: 0 });
  }, [ready, heat]);

  useEffect(() => {
    if (ready) map.current.getSource('routes').setData(lineFeatures(routes, (r) => r.preview, (r) => ({ id: r.id })));
  }, [ready, routes]);

  useEffect(() => {
    if (ready) map.current.setFilter('route-on', ['==', ['get', 'id'], picked ?? '']);
  }, [ready, picked]);

  useEffect(() => {
    if (!focus) return;
    moved.current = true;
    map.current.fitBounds(boundsOf(focus.preview), { padding: FIT, maxZoom: 15 });
  }, [focus]);

  useEffect(() => {
    if (!last || placed.current || moved.current) return;
    placed.current = true;
    map.current.jumpTo({ center: last, zoom: 14 });
  }, [last]);

  useEffect(() => {
    if (!pos) return;
    me.current.setLngLat(pos).addTo(map.current);
    if (moved.current) return;
    const view = { center: pos, zoom: Math.max(map.current.getZoom(), 14) };
    // First placement lands straight on the athlete; later fixes follow smoothly.
    if (placed.current) map.current.easeTo(view);
    else map.current.jumpTo(view);
    placed.current = true;
  }, [pos]);

  const locate = () => {
    moved.current = false;
    map.current.easeTo({ center: pos, zoom: Math.max(map.current.getZoom(), 14) });
  };

  return (
    <>
      <div ref={el} className="map explore-map" />
      <div className="map-fabs">
        <div ref={threeD} />
        <button type="button" className="map-fab" onClick={locate} disabled={!pos} aria-label={t('Me localiser')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
        </button>
        <a className="map-fab" href="#/route/new" aria-label={t('Créer un itinéraire')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L15 6l3 3L8 19zM13 8l3 3M18 2v6M15 5h6" /></svg>
        </a>
      </div>
    </>
  );
}
