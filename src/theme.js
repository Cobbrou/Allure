// JS-side colours (charts, map layers, canvas), mirroring the CSS tokens in styles/global.css.
export const ACCENT = '#ff5500';
export const BG = '#0f1115';
export const TEXT = '#f2f4f8'; // --text
export const TRACK = '#2e3340'; // --track: inactive bars
export const GOOD = '#22c55e'; // --good
export const GRID = '#262a34'; // chart grid lines (--border)
export const AXIS = '#3a3f4b'; // chart axis lines
export const TICK = '#8b93a7'; // chart labels (--muted)
export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
// Relief: AWS Terrain Tiles (Terrarium-encoded elevation, public, CORS enabled).
export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const HILLSHADE_SHADOW = '#000000';
export const HILLSHADE_HIGHLIGHT = '#3a3f4b'; // = AXIS: faint lit slopes on the dark basemap
// MapLibre's built-in UI strings (map aria-label, controls, cooperative-gesture hint), in the app's UI language.
export const MAP_LOCALE = {
  'AttributionControl.ToggleAttribution': 'Afficher les crédits',
  'GeolocateControl.FindMyLocation': 'Me localiser',
  'GeolocateControl.LocationNotAvailable': 'Position indisponible',
  'Map.Title': 'Carte',
  'Marker.Title': 'Repère',
  'NavigationControl.ResetBearing': 'Tourner la carte, toucher pour revenir au nord',
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer',
  'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer la carte',
};
