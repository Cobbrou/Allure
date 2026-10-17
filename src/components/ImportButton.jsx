import { t } from '../lib/i18n.js';
import { ACCEPT } from '../lib/importer.js';

/** File picker for activity files (.gpx, .tcx, .fit, .gz) and Strava export archives (.zip). */
export default function ImportButton({ onImport, className = 'button', children = t('Importer des activités') }) {
  return (
    <label className={className}>
      {children}
      <input type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onImport([...e.target.files]); e.target.value = ''; }} />
    </label>
  );
}
