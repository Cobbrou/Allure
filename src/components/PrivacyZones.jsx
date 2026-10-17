import { t } from '../lib/i18n.js';
import { useState } from 'react';
import { currentPosition } from '../lib/location.js';
import { ZONE_RADII } from '../lib/privacy.js';

/**
 * Privacy zones editor: a zone is a point and a radius; shared stories leave out the
 * start and end of a track inside it. A zone is placed at the current position or at the
 * start of the latest activity (usually home).
 */
export default function PrivacyZones({ zones, activities, onSave }) {
  const [name, setName] = useState(() => t('Domicile'));
  const [radius, setRadius] = useState(400);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastStart = activities?.find((a) => a.preview?.length)?.preview[0];

  const add = async (where) => {
    setBusy(true);
    setError(null);
    try {
      const pos = where === 'gps' ? await currentPosition() : lastStart && { lon: lastStart[0], lat: lastStart[1] };
      if (!pos) return setError(t('Position introuvable.'));
      await onSave([...zones, { id: crypto.randomUUID(), name: name.trim() || t('Zone'), lat: pos.lat, lon: pos.lon, radius }]);
    } finally { setBusy(false); }
  };

  return (
    <section className="card edit privacy">
      <h3>{t('Zones de confidentialité')}</h3>
      <p className="muted">{t("Le départ et l'arrivée situés dans ces zones n'apparaissent pas sur les stories partagées.")}</p>
      {zones.length > 0 && (
        <ul className="records">
          {zones.map((z) => (
            <li key={z.id}>
              <span className="rec-label">🔒 {z.name}</span>
              <span>
                <span className="muted">{z.radius} m</span>
                <button type="button" className="ghost small" onClick={() => onSave(zones.filter((x) => x.id !== z.id))} aria-label={t('Supprimer {name}', { name: z.name })}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <label>{t('Nom')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <label>{t('Rayon')}
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            {ZONE_RADII.map((r) => <option key={r} value={r}>{r} m</option>)}
          </select>
        </label>
      </div>
      <div className="row">
        <button type="button" onClick={() => add('gps')} disabled={busy}>{t('Ma position')}</button>
        {lastStart && <button type="button" className="ghost" onClick={() => add('last')} disabled={busy}>{t('Départ de ma dernière activité')}</button>}
      </div>
      {error && <p className="record-status bad" role="alert">{error}</p>}
    </section>
  );
}
