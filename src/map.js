// MapLibre setup shared by every map in the app.
import { Map as MapLibre, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker relative to its own module URL, which Vite's dep bundling breaks.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { mapStyle } from './lib/offline.js';
import { mapLocale } from './theme.js';

setWorkerUrl(workerUrl);

/** A map with the chosen style (offline tiles included) and labels in the app language. */
export const createMap = (options) => new MapLibre({ style: mapStyle(), locale: mapLocale(), ...options });

/** Chevron pointing along +x, for direction arrows along a line (`addImage(…, { pixelRatio: 2 })`). */
export function arrowImage(color) {
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

/** Symbol layer repeating the `arrow` image along a line source, pointing its way. */
export const arrowLayer = (id, source, spacing = 80) => ({ id, type: 'symbol', source,
  layout: { 'symbol-placement': 'line', 'symbol-spacing': spacing, 'icon-image': 'arrow', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map' } });
