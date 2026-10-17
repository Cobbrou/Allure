import { useEffect, useRef } from 'react';
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker relative to its own module URL, which Vite's dep bundling breaks.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { ACCENT, MAP_STYLE } from '../theme.js';

setWorkerUrl(workerUrl);

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

    map.on('load', () => {
      el.current?.classList.add('ready');
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
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
    return () => { hover.current = () => {}; if (range) range.current = () => {}; map.remove(); };
  }, [track, hover, range]);
  return <div ref={el} className="map" />;
}
