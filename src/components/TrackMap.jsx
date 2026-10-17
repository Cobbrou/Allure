import { useEffect, useRef } from 'react';
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker relative to its own module URL, which Vite's dep bundling breaks.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MAP_STYLE } from '../lib/offline.js';
import { ACCENT, DEM_TILES, HILLSHADE_HIGHLIGHT, HILLSHADE_SHADOW } from '../theme.js';

setWorkerUrl(workerUrl);

const DRAW_MS = 1200; // route drawing animation
const EXAGGERATION = 1.5; // relief reads better a bit taller than life
const PITCH_3D = 60;

/**
 * Route map. Sets `hover.current(index | null)` to move a cursor imperatively (no re-render),
 * and `range.current([from, to] | null)` to highlight a stretch (segment creation).
 */
export default function TrackMap({ track, hover, range }) {
  const el = useRef();
  useEffect(() => {
    const coords = track.map((p) => [p.lon, p.lat]);
    const bounds = coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
    // cooperativeGestures: one finger scrolls the page, two fingers move the map (ctrl+wheel on desktop).
    const map = new MapLibre({ container: el.current, style: MAP_STYLE, bounds, fitBoundsOptions: { padding: 40 }, cooperativeGestures: true });

    const line = (c) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c } });
    let frame;
    map.on('load', () => {
      el.current?.classList.add('ready');
      const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Relief for the 3D view: hillshade and terrain from one DEM source, off until toggled.
      map.addSource('dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15,
        attribution: 'Relief : Mapzen, AWS Terrain Tiles' });
      map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', layout: { visibility: 'none' },
        paint: { 'hillshade-shadow-color': HILLSHADE_SHADOW, 'hillshade-highlight-color': HILLSHADE_HIGHLIGHT, 'hillshade-exaggeration': 0.6 } },
        map.getStyle().layers.find((l) => l.type === 'symbol')?.id); // under the place names
      map.addControl(new Toggle3D(), 'top-right');
      map.addSource('route', { type: 'geojson', data: line(animate ? coords.slice(0, 2) : coords) });
      // The route draws itself from start to finish once the map is in.
      if (animate) {
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / DRAW_MS);
          const n = Math.max(2, Math.ceil(coords.length * (1 - (1 - k) ** 3)));
          map.getSource('route')?.setData(line(coords.slice(0, n)));
          if (k < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      }
      map.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': 4 } });
      map.addSource('range', { type: 'geojson', data: rangeData() });
      map.addLayer({ id: 'range', type: 'line', source: 'range', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#fff', 'line-width': 6 } });
    });
    let selected = null;
    const rangeData = () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: selected ? coords.slice(selected[0], selected[1] + 1) : [] } });

    const pin = (cls, title) => Object.assign(document.createElement('div'), { className: `pin ${cls}`, title });
    new Marker({ element: pin('finish', 'Arrivée') }).setLngLat(coords.at(-1)).addTo(map);
    new Marker({ element: pin('start', 'Départ') }).setLngLat(coords[0]).addTo(map);
    const cursor = new Marker({ element: pin('cursor', '') });

    hover.current = (i) => (i == null ? cursor.remove() : cursor.setLngLat(coords[i]).addTo(map));
    if (range) range.current = (r) => { selected = r; map.getSource('range')?.setData(rangeData()); };
    return () => { cancelAnimationFrame(frame); hover.current = () => {}; if (range) range.current = () => {}; map.remove(); };
  }, [track, hover, range]);
  return <div ref={el} className="map" />;
}

/** Map control: a "3D" button that drapes the map on the relief and tilts the camera. */
class Toggle3D {
  onAdd(map) {
    const btn = Object.assign(document.createElement('button'), { type: 'button', textContent: '3D', className: 'ctrl-3d', title: 'Relief 3D' });
    btn.setAttribute('aria-pressed', 'false');
    btn.onclick = () => {
      const on = !map.getTerrain();
      map.setTerrain(on ? { source: 'dem', exaggeration: EXAGGERATION } : null);
      map.setLayoutProperty('hillshade', 'visibility', on ? 'visible' : 'none');
      map.easeTo({ pitch: on ? PITCH_3D : 0, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1000 });
      btn.setAttribute('aria-pressed', String(on));
    };
    this.el = Object.assign(document.createElement('div'), { className: 'maplibregl-ctrl maplibregl-ctrl-group' });
    this.el.append(btn);
    return this.el;
  }

  onRemove() { this.el.remove(); }
}
