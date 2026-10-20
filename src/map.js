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
