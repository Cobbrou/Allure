import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Marker } from 'maplibre-gl';
import { createMap } from '../map.js';
import BottomSheet from '../components/BottomSheet.jsx';
import Icon from '../components/Icon.jsx';
import RoutePreview from '../components/RoutePreview.jsx';
import Segmented from '../components/Segmented.jsx';
import Terrain3D from '../components/Terrain3D.js';
import { preview } from '../lib/activity.js';
import { analyze } from '../lib/analyze.js';
import { getSetting, setSetting, thinTracks } from '../lib/db.js';
import { distUnit, elevUnit, fmtDist, fmtElev, fmtHm, isImperial } from '../lib/format.js';
import { homeLines } from '../lib/heatmap.js';
import { watchPosition } from '../lib/location.js';
import { createRoute, fetchRoute, nearestFirst, splitLegs } from '../lib/routes.js';
import { SPORTS } from '../lib/sports.js';
import { BEARINGS, cellKey, difficulty, estimateTime, FALLBACK_START, familiarity, loopWaypoints, rank, settleLimited } from '../lib/suggest.js';
import { ACCENT, BG, CASING, HEAT } from '../theme.js';

const SLIDE_GAP = 10; // px between carousel cards, = .map-carousel gap
const KM = { run: [3, 30, 10], ride: [10, 150, 40], hike: [5, 30, 12] }; // min, max, default
const OFF_TARGET = 0.15; // a first loop further than this from the target distance is routed again, resized
const terrains = () => [{ id: '', label: t('Peu importe') }, { id: 'flat', label: t('Plat') }, { id: 'hilly', label: t('Vallonné') }];
const surfaces = () => [{ id: '', label: t('Peu importe') }, { id: 'paved', label: t('Route') }, { id: 'trail', label: t('Chemins') }];
const levels = () => [{ id: '', label: t('Peu importe') }, { id: 'easy', label: t('Facile') }, { id: 'medium', label: t('Moyen') }, { id: 'hard', label: t('Difficile') }];
const headings = () => [t('nord'), t('nord-est'), t('est'), t('sud-est'), t('sud'), t('sud-ouest'), t('ouest'), t('nord-ouest')];
const activity = () => ({ run: t('Courses à pied'), ride: t('Sorties à vélo'), hike: t('Randonnées') });
const ground = () => ({ '': '', flat: t('sur terrain plat'), hilly: t('sur terrain vallonné') });
const label = (options, id) => options.find((o) => o.id === id)?.label;

// Filters and the last loops found outlive the page, so leaving the tab and coming back keeps them.
const memo = { prefs: { sport: 'run', km: KM.run[2], terrain: '', surface: '', level: '', discover: false }, ideas: null };

/**
 * Maps tab: full-screen map around the athlete. Filter chips and "Search" route loops from
 * the area in view; the loops are drawn together and listed in a bottom carousel, synced
 * both ways with the map. "Saved" swaps them for the athlete's saved routes, nearest first.
 */
export default function MapsPage({ activities, routes, onSave }) {
  const list = activities ?? [];
  const [lines, setLines] = useState(null); // [{ sport, coords }]
  const [prefs, setPrefs] = useState(memo.prefs);
  const [ideas, setIdeas] = useState(memo.ideas); // null | 'loading' | { list, near } | { error }
  const [view, setView] = useState('ideas'); // 'ideas' | 'saved'
  const [query, setQuery] = useState('');
  const [pane, setPane] = useState(null); // open filter sheet: 'distance' | 'level' | 'terrain' | 'surface' | 'layers'
  const [sheet, setSheet] = useState(false); // bottom list expanded
  const [heat, setHeat] = useState(false); // off by default: its pale accent lines read like alternative loops
  const [pos, setPos] = useState(null); // [lon, lat]
  const [origin, setOrigin] = useState(null); // first fix: routes are sorted from it, so the carousel doesn't reshuffle as you walk
  const [gpsError, setGpsError] = useState(null);
  const [index, setIndex] = useState(0);
  const [focus, setFocus] = useState(null); // item to fit the map on, after a swipe
  const carousel = useRef();
  const map = useRef();
  const cells = useRef(null);
  const swipe = useRef(0);
  const set = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const { sport, km, terrain, surface, level, discover } = prefs;

  useEffect(() => { memo.prefs = prefs; memo.ideas = ideas === 'loading' ? null : ideas; }, [prefs, ideas]);

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
    thinTracks(activities).then((l) => {
      setLines(l);
      // ~100 m cells covered by past tracks, for the "new ground" preference.
      cells.current = new Set(l.flatMap((x) => x.coords.map(([lon, lat]) => cellKey(lon, lat))));
    }, () => setLines([]));
  }, [activities]);

  const items = useMemo(() => {
    if (view === 'ideas') return Array.isArray(ideas?.list) ? ideas.list : [];
    const q = query.trim().toLowerCase();
    const r = (routes ?? []).filter((x) => x.preview?.length > 1 && x.name.toLowerCase().includes(q));
    return (origin ? nearestFirst(r, origin) : r)
      .map((x) => ({ id: x.id, title: x.name, sport: x.sport, coords: x.preview, line: x.preview, distance: x.distance, gain: x.gain, route: x }));
  }, [view, ideas, routes, query, origin]);

  useEffect(() => {
    setIndex(0);
    carousel.current?.scrollTo({ left: 0 });
  }, [view, ideas]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / (el.firstElementChild.offsetWidth + SLIDE_GAP));
    if (i === index || !items[i]) return;
    setIndex(i);
    setFocus(items[i]);
  };
  const pick = (id) => {
    setSheet(false);
    // Next frame: the carousel is hidden while the list is open.
    requestAnimationFrame(() => carousel.current?.children[items.findIndex((r) => r.id === id)]
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }));
  };

  const generate = async () => {
    setPane(null);
    setView('ideas');
    setQuery('');
    setSheet(false);
    const m = map.current;
    // From the athlete when they're in view, else from the middle of the area they're looking at.
    const near = !!pos && m.getBounds().contains(pos);
    const from = near ? pos : m.getCenter().toArray().map((x) => Math.round(x * 1e6) / 1e6);
    setIdeas('loading');
    const target = km * 1000;
    const loop = async (bearing) => {
      let waypoints = loopWaypoints(from, target, bearing);
      let r = await fetchRoute(waypoints, sport, surface);
      const first = analyze(r.points).distance;
      if (Math.abs(first - target) / target > OFF_TARGET) {
        waypoints = loopWaypoints(from, target, bearing, Math.min(2, Math.max(0.5, target / first)));
        r = await fetchRoute(waypoints, sport, surface);
      }
      const { distance, gain } = analyze(r.points);
      return { bearing, waypoints, points: r.points, distance, gain, unpaved: r.unpaved, familiar: familiarity(r.points, cells.current) };
    };
    const settled = await settleLimited(BEARINGS, 2, loop);
    const all = settled.filter((x) => x.status === 'fulfilled').map((x) => x.value);
    // fetch rejects with a TypeError when offline; anything else (rate limit, no route) says what happened.
    const told = settled.find((x) => x.status === 'rejected' && !(x.reason instanceof TypeError))?.reason.message;
    if (!all.length) return setIdeas({ error: told ?? t('Aucun itinéraire trouvé : vérifie ta connexion.') });
    const found = rank(all, { distance: target, sport, terrain, surface, level, discover }).map((c) => ({
      ...c, id: String(c.bearing), sport, title: t('Boucle {dir}', { dir: headings()[Math.round(c.bearing / 45) % 8] }),
      coords: preview(c.points), line: c.points.map((p) => [p.lon, p.lat]),
    }));
    setIdeas({ list: found, near });
    setFocus(found[0]);
  };

  const save = async (c) => {
    const r = createRoute({ name: c.title, sport: c.sport, snap: true, waypoints: c.waypoints, legs: splitLegs(c.points, c.waypoints) });
    await onSave(r);
    setIdeas((x) => ({ ...x, list: x.list.map((y) => (y.id === c.id ? { ...y, savedId: r.id } : y)) }));
  };

  const picked = items[index];
  const callout = view === 'ideas' && picked?.unpaved != null && {
    at: picked.line[Math.floor(picked.line.length / 2)],
    text: picked.unpaved < 0.5 ? t('{n} % route bitumée', { n: Math.round((1 - picked.unpaved) * 100) }) : t('{n} % de chemins', { n: Math.round(picked.unpaved * 100) }),
  };
  const [min, max] = KM[sport];
  const chip = (id, name, value) => (
    <button type="button" className={`map-chip${value ? ' set' : ''}`} onClick={() => setPane(id)}>{value || name}<span aria-hidden="true">▾</span></button>
  );
  const card = (c, i) => (
    <RouteCard key={c.id} item={c} on={i === index} near={ideas?.near} onOpen={() => pick(c.id)} onSave={() => save(c)} />
  );
  const start = origin ?? list.find((a) => a.preview?.length)?.preview[0] ?? FALLBACK_START;
  return (
    <main className={`explore${sheet ? ' sheet-open' : ''}`}>
      <ExploreMap api={map} start={start} last={last} pos={pos} heat={heat ? lines : null} routes={items} picked={picked?.id} focus={focus} callout={callout || null} onPick={pick}>
        <button type="button" className="map-fab" onClick={() => setPane('layers')} aria-label={t('Couches')}>
          <Icon name="layers" />
          {heat && <span className="map-fab-count" aria-hidden="true">1</span>}
        </button>
      </ExploreMap>
      <div className="explore-top">
        <div className="map-search">
          <label className="map-sport">
            <Icon name={sport} />
            <select aria-label={t('Sport')} value={sport} onChange={(e) => set({ sport: e.target.value, km: KM[e.target.value][2] })}>
              {['run', 'ride', 'hike'].map((id) => <option key={id} value={id}>{SPORTS[id].label}</option>)}
            </select>
          </label>
          <input
            type="search" enterKeyHint="search" value={query} aria-label={t('Rechercher dans mes itinéraires')}
            placeholder={view === 'saved' ? t('Rechercher dans mes itinéraires') : `${activity()[sport]} ${ground()[terrain]}`.trim()}
            onChange={(e) => { setQuery(e.target.value); if (e.target.value) setView('saved'); }}
          />
          <button type="button" className="map-saved" aria-pressed={view === 'saved'} onClick={() => setView(view === 'saved' ? 'ideas' : 'saved')}>
            <Icon name="bookmark" /><span>{t('Enregistré')}</span>
          </button>
        </div>
        <div className="map-chips">
          <button type="button" className="map-chip" aria-pressed={view === 'ideas'} onClick={() => { setView('ideas'); setQuery(''); }}>{t('Itinéraires')}</button>
          {chip('distance', t('Distance'), `${fmtDist(km * 1000, isImperial() ? 1 : 0)} ${distUnit()}`)}
          {chip('level', t('Difficulté'), level && label(levels(), level))}
          {chip('terrain', t('Dénivelé'), terrain && label(terrains(), terrain))}
          {chip('surface', t('Surface'), surface && label(surfaces(), surface))}
          <button type="button" className="map-chip" aria-pressed={discover} onClick={() => set({ discover: !discover })}>{t('Nouveaux coins')}</button>
        </div>
        <button type="button" className="map-go" onClick={generate} disabled={ideas === 'loading'}>
          {t(ideas === 'loading' ? "Recherche d'itinéraires…" : 'Chercher')}
        </button>
        {ideas?.error && view === 'ideas' && <p className="map-alert" role="alert"><span aria-hidden="true">!</span>{ideas.error}</p>}
        {gpsError && <p className="map-alert" role="status"><span aria-hidden="true">i</span>{gpsError}</p>}
      </div>
      <div className="map-carousel" ref={carousel} onScroll={onScroll}>
        {items.map(card)}
        {view === 'ideas' && !items.length && (
          <div className="card link-card"><span><b>{t("Idées d'itinéraires")}</b><span className="muted">{t('Des boucles proposées selon ta distance, ton dénivelé et tes envies')}</span></span></div>
        )}
        {view === 'saved' && (
          <a className="card link-card" href="#/route/new">
            <span><b>{t('Créer un itinéraire')}</b><span className="muted">{t('Trace ton parcours, collé aux routes et sentiers')}</span></span>
            <span aria-hidden="true">›</span>
          </a>
        )}
      </div>
      <section className="explore-sheet">
        <button
          type="button" className="explore-sheet-top" aria-expanded={sheet} onClick={() => setSheet(!sheet)}
          onTouchStart={(e) => { swipe.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => { const dy = e.changedTouches[0].clientY - swipe.current; if (Math.abs(dy) > 30) { e.preventDefault(); setSheet(dy < 0); } }}
        >
          <span className="sheet-handle" aria-hidden="true" />
          {t('Explore librement et en toute confiance')}
        </button>
        {sheet && <div className="explore-list">{items.length ? items.map(card) : <p className="muted">{view === 'ideas' ? t('Des boucles proposées selon ta distance, ton dénivelé et tes envies') : t('Aucun itinéraire enregistré')}</p>}</div>}
      </section>
      <BottomSheet open={!!pane} onClose={() => setPane(null)} title={{ distance: t('Distance'), level: t('Difficulté'), terrain: t('Dénivelé'), surface: t('Surface'), layers: t('Couches') }[pane]}>
        <div className="sheet-actions map-pane">
          {pane === 'distance' && (
            <label>{t('Distance : {dist}', { dist: `${fmtDist(km * 1000, isImperial() ? 1 : 0)} ${distUnit()}` })}
              <input type="range" min={min} max={max} step={sport === 'ride' ? 5 : 1} value={km} onChange={(e) => set({ km: Number(e.target.value) })} />
            </label>
          )}
          {pane === 'level' && <Segmented label={t('Difficulté')} options={levels()} value={level} onChange={(v) => set({ level: v })} />}
          {pane === 'terrain' && <Segmented label={t('Dénivelé')} options={terrains()} value={terrain} onChange={(v) => set({ terrain: v })} />}
          {pane === 'surface' && <Segmented label={t('Surface')} options={surfaces()} value={surface} onChange={(v) => set({ surface: v })} />}
          {pane === 'layers'
            ? <label className="switch"><input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} />{t('Chaleur')}</label>
            : <button type="button" onClick={generate} disabled={ideas === 'loading'}>{t('Chercher')}</button>}
        </div>
      </BottomSheet>
    </main>
  );
}

/** One route in the carousel or the list: thumbnail, name, stats; ideas get a start line and a save button. */
function RouteCard({ item, on, near, onOpen, onSave }) {
  const lvl = difficulty(item.distance, item.gain, item.sport);
  const saved = item.route?.id ?? item.savedId;
  return (
    <article className={`card idea-card${on ? ' on' : ''}`}>
      <RoutePreview coords={item.coords} square />
      <div>
        <h3>{item.route ? <a href={`#/route/${item.route.id}`}>{item.title}</a> : <button type="button" onClick={onOpen}>{item.title}</button>}</h3>
        <p className="stats">
          <Icon name={item.sport} />
          <span className={`level ${lvl}`}>{label(levels(), lvl)}</span>
          {fmtDist(item.distance, 1)} {distUnit()} · {fmtElev(item.gain ?? 0)} {elevUnit()} · {fmtHm(estimateTime(item.distance, item.gain, item.sport))}
        </p>
        {!item.route && <p><Icon name="mapPin" />{near ? t('Depuis ta position') : t('Depuis le centre de la carte')}</p>}
        {!item.route && <p className="for-you"><Icon name="sparkles" />{t('Rien que pour toi')}</p>}
      </div>
      {saved
        ? <a className="idea-save saved" href={`#/route/${saved}`} aria-label={t("Ouvrir l'itinéraire enregistré")}><Icon name="bookmark" /></a>
        : <button type="button" className="idea-save" onClick={onSave} aria-label={t("Enregistrer l'itinéraire")}><Icon name="bookmark" /></button>}
    </article>
  );
}

const lineFeatures = (items, coords, props = () => ({})) => ({
  type: 'FeatureCollection',
  // One feature per line: overlapping heatmap features add up their opacity, a single feature would not.
  features: items.map((x) => ({ type: 'Feature', properties: props(x), geometry: { type: 'LineString', coordinates: coords(x) } })),
});
const boundsOf = (coords) => coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
const FIT = { top: 190, bottom: 200, left: 30, right: 80 }; // clear of the floating controls and the carousel
const PICKED = ['route-shadow', 'route-casing', 'route-on', 'route-arrows'];

/** Chevron pointing along +x, drawn once for the direction arrows on the picked route. */
function arrowImage(color) {
  const c = Object.assign(document.createElement('canvas'), { width: 20, height: 20 });
  const g = c.getContext('2d');
  Object.assign(g, { strokeStyle: color, lineWidth: 4, lineCap: 'round', lineJoin: 'round' });
  g.beginPath();
  g.moveTo(7, 4);
  g.lineTo(13, 10);
  g.lineTo(7, 16);
  g.stroke();
  return g.getImageData(0, 0, 20, 20);
}

/**
 * The map itself. api: ref set to the MapLibre map; last: last known position, to open on;
 * heat: heatmap lines, or null when hidden; routes: [{ id, line }]; picked: highlighted id;
 * focus: route to fit on; callout: { at, text } badge on the picked route; children: extra
 * buttons on top of the floating column.
 */
function ExploreMap({ api, start, last, pos, heat, routes, picked, focus, callout, onPick, children }) {
  const el = useRef();
  const map = useRef();
  const me = useRef();
  const badge = useRef();
  const threeD = useRef();
  const moved = useRef(false); // the athlete panned: stop auto-centering
  const placed = useRef(false); // centered on the athlete (live or last known): no heatmap fit
  const cb = useRef();
  cb.current = onPick;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // No cooperativeGestures: the map fills the screen, nothing to scroll, so one finger pans it.
    const m = createMap({ container: el.current, center: start, zoom: 12 });
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
      // Every route faint and thin, the picked one bold over a dark halo and a light casing, with arrows.
      m.addSource('routes', { type: 'geojson', data: lineFeatures([], () => []) });
      m.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: round, paint: { 'line-color': ACCENT, 'line-width': 3, 'line-opacity': 0.45 } });
      m.addLayer({ id: 'route-shadow', type: 'line', source: 'routes', layout: round, paint: { 'line-color': BG, 'line-width': 13, 'line-opacity': 0.5 } });
      m.addLayer({ id: 'route-casing', type: 'line', source: 'routes', layout: round, paint: { 'line-color': CASING, 'line-width': 9 } });
      m.addLayer({ id: 'route-on', type: 'line', source: 'routes', layout: round, paint: { 'line-color': ACCENT, 'line-width': 6 } });
      m.addImage('arrow', arrowImage(BG), { pixelRatio: 2 });
      m.addLayer({ id: 'route-arrows', type: 'symbol', source: 'routes',
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 80, 'icon-image': 'arrow', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map' } });
      for (const id of PICKED) m.setFilter(id, ['==', ['get', 'id'], '']);
      // Wide invisible line: a finger-sized target to tap a route.
      m.addLayer({ id: 'routes-hit', type: 'line', source: 'routes', layout: round, paint: { 'line-color': ACCENT, 'line-width': 24, 'line-opacity': 0 } });
      m.on('click', 'routes-hit', (e) => cb.current(e.features[0].properties.id));
      // The 3D button joins the floating column instead of a map corner.
      threeD.current.replaceChildren(new Terrain3D().onAdd(m));
      setReady(true);
    });
    me.current = new Marker({ element: Object.assign(document.createElement('div'), { className: 'pin me' }) });
    badge.current = new Marker({ element: Object.assign(document.createElement('div'), { className: 'map-callout' }), anchor: 'bottom', offset: [0, -10] });
    map.current = api.current = m;
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
    if (ready) map.current.getSource('routes').setData(lineFeatures(routes, (r) => r.line, (r) => ({ id: r.id })));
  }, [ready, routes]);

  useEffect(() => {
    if (!ready) return;
    for (const id of PICKED) map.current.setFilter(id, ['==', ['get', 'id'], picked ?? '']);
    map.current.setFilter('routes', ['!=', ['get', 'id'], picked ?? '']);
  }, [ready, picked]);

  useEffect(() => {
    if (!callout) return void badge.current.remove();
    badge.current.getElement().textContent = callout.text;
    badge.current.setLngLat(callout.at).addTo(map.current);
  }, [callout?.text, callout?.at]); // eslint-disable-line react-hooks/exhaustive-deps -- a new object every render

  useEffect(() => {
    if (!focus) return;
    moved.current = true;
    map.current.fitBounds(boundsOf(focus.line), { padding: FIT, maxZoom: 15 });
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
        {children}
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
