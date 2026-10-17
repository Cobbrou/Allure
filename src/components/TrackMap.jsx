import { t } from '../lib/i18n.js';
import { useEffect, useRef } from 'react';
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker relative to its own module URL, which Vite's dep bundling breaks.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MAP_STYLE } from '../lib/offline.js';
import { ACCENT, mapLocale } from '../theme.js';
import Terrain3D from './Terrain3D.js';

setWorkerUrl(workerUrl);

const DRAW_MS = 1200; // route drawing animation

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
    const map = new MapLibre({ container: el.current, style: MAP_STYLE, locale: mapLocale(), bounds, fitBoundsOptions: { padding: 40 }, cooperativeGestures: true });

    const line = (c) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c } });
    let frame;
    map.on('load', () => {
      el.current?.classList.add('ready');
      const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.addControl(new Terrain3D(), 'top-right');
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
    new Marker({ element: pin('finish', t('Arrivée')) }).setLngLat(coords.at(-1)).addTo(map);
    new Marker({ element: pin('start', t('Départ')) }).setLngLat(coords[0]).addTo(map);
    const cursor = new Marker({ element: pin('cursor', '') });

    hover.current = (i) => (i == null ? cursor.remove() : cursor.setLngLat(coords[i]).addTo(map));
    if (range) range.current = (r) => { selected = r; map.getSource('range')?.setData(rangeData()); };
    return () => { cancelAnimationFrame(frame); hover.current = () => {}; if (range) range.current = () => {}; map.remove(); };
  }, [track, hover, range]);
  return <div ref={el} className="map" />;
}
