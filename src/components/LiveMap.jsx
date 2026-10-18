import { useEffect, useRef } from 'react';
import { Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Same Vite worker fix as TrackMap.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MAP_STYLE } from '../lib/offline.js';
import { ACCENT, mapLocale, ROUTE } from '../theme.js';

setWorkerUrl(workerUrl);

const line = (points) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) } });

/** Map following the athlete while recording. pos: last fix { lat, lon }; route: [lon, lat] coords to follow. */
export default function LiveMap({ points, pos, route }) {
  const el = useRef();
  const map = useRef();
  const me = useRef();

  useEffect(() => {
    const m = new MapLibre({ container: el.current, style: MAP_STYLE, locale: mapLocale(), center: [pos.lon, pos.lat], zoom: 16, cooperativeGestures: true });
    m.on('load', () => {
      el.current?.classList.add('ready');
      if (route) {
        m.addSource('planned', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route } } });
        m.addLayer({ id: 'planned', type: 'line', source: 'planned', layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ROUTE, 'line-width': 6, 'line-opacity': 0.6 } });
      }
      m.addSource('route', { type: 'geojson', data: line(points) });
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': 5 } });
    });
    me.current = new Marker({ element: Object.assign(document.createElement('div'), { className: 'pin me' }) }).setLngLat([pos.lon, pos.lat]).addTo(m);
    map.current = m;
    return () => m.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- created once, updated below

  useEffect(() => {
    const m = map.current;
    m.getSource('route')?.setData(line(points));
    me.current.setLngLat([pos.lon, pos.lat]);
    m.easeTo({ center: [pos.lon, pos.lat], duration: 500 });
  }, [points, pos]);

  return <div ref={el} className="map live" />;
}
