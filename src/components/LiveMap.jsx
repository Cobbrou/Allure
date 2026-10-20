import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import { Marker } from 'maplibre-gl';
import { createMap } from '../map.js';
import { haversine } from '../lib/geo.js';
import { ACCENT, ROUTE } from '../theme.js';


const GAP = 5; // m between drawn vertices: invisible at street zoom, fewer for slow sports
const CHUNK = 300; // vertices in the redrawn tail before it joins the drawn-once part

const line = (coords) => (coords.length > 1
  ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
  : { type: 'FeatureCollection', features: [] });

/**
 * Map following the athlete while recording. pos: last fix { lat, lon }; route: [lon, lat]
 * coords to follow. The track is drawn as a long `done` part, set again only every CHUNK
 * vertices, and a short tail set on every fix: a 6 h ride doesn't send 20,000 points a second.
 * Dragging the map stops following the athlete until the recenter button.
 */
export default function LiveMap({ points, pos, route }) {
  const el = useRef();
  const map = useRef();
  const me = useRef();
  const drawn = useRef({ n: 0, last: null, done: [], tail: [] });
  const [follow, setFollow] = useState(true);
  const following = useRef(true);
  following.current = follow;

  /** Add the new points to the drawn track; true when the `done` part grew. */
  const feed = () => {
    const d = drawn.current;
    for (; d.n < points.length; d.n++) {
      const p = points[d.n];
      if (d.last && haversine(d.last, p) < GAP) continue;
      d.tail.push([p.lon, p.lat]);
      d.last = p;
    }
    if (d.tail.length <= CHUNK) return false;
    d.done = d.done.concat(d.tail.slice(0, -1));
    d.tail = d.tail.slice(-1); // shared vertex: the two parts stay joined
    return true;
  };

  useEffect(() => {
    const m = createMap({ container: el.current, center: [pos.lon, pos.lat], zoom: 16, cooperativeGestures: true });
    m.on('load', () => {
      el.current?.classList.add('ready');
      if (route) {
        m.addSource('planned', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route } } });
        m.addLayer({ id: 'planned', type: 'line', source: 'planned', layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ROUTE, 'line-width': 6, 'line-opacity': 0.6 } });
      }
      feed();
      const { done, tail } = drawn.current;
      for (const [id, coords] of [['done', done], ['route', tail]]) {
        m.addSource(id, { type: 'geojson', data: line(coords) });
        m.addLayer({ id, type: 'line', source: id, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ACCENT, 'line-width': 5 } });
      }
    });
    m.on('dragstart', () => setFollow(false));
    me.current = new Marker({ element: Object.assign(document.createElement('div'), { className: 'pin me' }) }).setLngLat([pos.lon, pos.lat]).addTo(m);
    map.current = m;
    return () => m.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- created once, updated below

  useEffect(() => {
    const m = map.current;
    if (m.getSource('route')) {
      if (feed()) m.getSource('done').setData(line(drawn.current.done));
      m.getSource('route').setData(line([...drawn.current.tail, [pos.lon, pos.lat]]));
    }
    me.current.setLngLat([pos.lon, pos.lat]);
    if (following.current) m.easeTo({ center: [pos.lon, pos.lat], duration: 500 });
  }, [points, pos]); // eslint-disable-line react-hooks/exhaustive-deps -- feed reads the latest points

  const recenter = () => {
    setFollow(true);
    map.current.easeTo({ center: [pos.lon, pos.lat], duration: 500 });
  };

  return (
    <>
      <div ref={el} className="map live" />
      {!follow && (
        <button type="button" className="map-fab live-recenter" onClick={recenter} aria-label={t('Recentrer sur ma position')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
        </button>
      )}
    </>
  );
}
