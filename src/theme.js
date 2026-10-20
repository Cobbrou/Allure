import { t } from './lib/i18n.js';

// JS-side colours (charts, map layers, canvas), mirroring the CSS tokens in styles/global.css.
// The theme, accent and map style are settings: App calls setTheme() before rendering and
// remounts the tree on change, so these live bindings hold the current values during render.

// Accents offered (id: colour): each keeps --on-accent (dark text) at WCAG AA or better.
export const ACCENTS = [
  { id: '#ff5500', get label() { return t('Orange'); } },
  { id: '#f5b301', get label() { return t('Ambre'); } },
  { id: '#22c55e', get label() { return t('Vert'); } },
  { id: '#38bdf8', get label() { return t('Bleu'); } },
  { id: '#a78bfa', get label() { return t('Violet'); } },
  { id: '#f472b6', get label() { return t('Rose'); } },
];
export const GOOD = '#22c55e'; // --good
export const HR = '#ef4444'; // --hr
export const FATIGUE = '#a78bfa'; // Fitness & Freshness: fatigue line
export const PREVIOUS = '#64748b'; // a previous best drawn behind the current one
export const CASING = '#ffffff'; // outline under the main GPS track
export const ROUTE = '#60a5fa'; // planned routes on maps (not the main GPS track)

const DARK = {
  BG: '#0f1115',
  TEXT: '#f2f4f8', // --text
  TRACK: '#2e3340', // --track: inactive bars
  GRID: '#262a34', // chart grid lines (--border)
  AXIS: '#3a3f4b', // chart axis lines
  TICK: '#8b93a7', // chart labels (--muted)
  HR_TICK: '#f87171', // heart-rate axis labels, lighter than the line (--hr-text)
  ELEVATION: '#cbd5e1', // elevation profile line (--elevation)
  HILLSHADE_HIGHLIGHT: '#3a3f4b', // = AXIS: faint lit slopes on the dark basemap
};
const LIGHT = {
  BG: '#ffffff', // --card: charts sit on cards
  TEXT: '#12151b',
  TRACK: '#e3e6ec',
  GRID: '#dfe2e8',
  AXIS: '#c9ced8',
  TICK: '#5b6375',
  HR_TICK: '#dc2626',
  ELEVATION: '#64748b',
  HILLSHADE_HIGHLIGHT: '#ffffff',
};
// Story images are always dark, whatever the app theme.
export const STORY = { BG: DARK.BG, TEXT: DARK.TEXT, TICK: DARK.TICK, TRACK: DARK.TRACK };

// Carto basemaps: all three share the same vector tiles, so an offline route map works in any of them.
const CARTO = (name) => `https://basemaps.cartocdn.com/gl/${name}-gl-style/style.json`;
export const MAP_STYLES = { dark: CARTO('dark-matter'), light: CARTO('positron'), color: CARTO('voyager') };

export let ACCENT, MAP_STYLE, BG, TEXT, TRACK, GRID, AXIS, TICK, HR_TICK, ELEVATION, HILLSHADE_HIGHLIGHT;
export let HEAT; // personal heatmap lines: pale accent on dark, deeper accent on light

/** '#rrggbb' mixed with white (w > 0) or black (w < 0) by |w|. */
const shade = (hex, w) => '#' + [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16);
  return Math.round(w > 0 ? c + (255 - c) * w : c * (1 + w)).toString(16).padStart(2, '0');
}).join('');

/** Apply the theme settings. light: resolved theme; map: 'auto' (follows the theme) or a MAP_STYLES key. */
export function setTheme({ light = false, accent, map = 'auto' } = {}) {
  ({ BG, TEXT, TRACK, GRID, AXIS, TICK, HR_TICK, ELEVATION, HILLSHADE_HIGHLIGHT } = light ? LIGHT : DARK);
  ACCENT = ACCENTS.some((a) => a.id === accent) ? accent : ACCENTS[0].id;
  HEAT = shade(ACCENT, light ? -0.15 : 0.55);
  MAP_STYLE = MAP_STYLES[map] ?? (light ? MAP_STYLES.light : MAP_STYLES.dark);
}
setTheme();
// Relief: AWS Terrain Tiles (Terrarium-encoded elevation, public, CORS enabled).
export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const HILLSHADE_SHADOW = '#000000';
// MapLibre's built-in UI strings (map aria-label, controls, cooperative-gesture hint), in the app's UI language.
export const mapLocale = () => ({
  'AttributionControl.ToggleAttribution': t('Afficher les crédits'),
  'GeolocateControl.FindMyLocation': t('Me localiser'),
  'GeolocateControl.LocationNotAvailable': t('Position indisponible'),
  'Map.Title': t('Carte'),
  'Marker.Title': t('Repère'),
  'NavigationControl.ResetBearing': t('Tourner la carte, toucher pour revenir au nord'),
  'NavigationControl.ZoomIn': t('Zoomer'),
  'NavigationControl.ZoomOut': t('Dézoomer'),
  'CooperativeGesturesHandler.WindowsHelpText': t('Ctrl + molette pour zoomer'),
  'CooperativeGesturesHandler.MacHelpText': t('⌘ + molette pour zoomer'),
  'CooperativeGesturesHandler.MobileHelpText': t('Deux doigts pour déplacer la carte'),
});
