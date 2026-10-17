import { t } from '../lib/i18n.js';
import { DEM_TILES, HILLSHADE_HIGHLIGHT, HILLSHADE_SHADOW } from '../theme.js';

const EXAGGERATION = 1.5; // relief reads better a bit taller than life
const PITCH_3D = 60;

/**
 * MapLibre control: a "3D" button that drapes the map on the relief, shows a hillshade and
 * tilts the camera. Add it once the style has loaded (it adds its DEM source and layer).
 */
export default class Terrain3D {
  onAdd(map) {
    // Hillshade and terrain from one DEM source, off until toggled.
    map.addSource('dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15,
      attribution: t('Relief : Mapzen, AWS Terrain Tiles') });
    map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', layout: { visibility: 'none' },
      paint: { 'hillshade-shadow-color': HILLSHADE_SHADOW, 'hillshade-highlight-color': HILLSHADE_HIGHLIGHT, 'hillshade-exaggeration': 0.6 } },
    map.getStyle().layers.find((l) => l.type === 'symbol')?.id); // under the place names

    const btn = Object.assign(document.createElement('button'), { type: 'button', textContent: '3D', className: 'ctrl-3d', title: t('Relief 3D') });
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
