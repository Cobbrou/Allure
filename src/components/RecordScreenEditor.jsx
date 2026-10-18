import { t } from '../lib/i18n.js';
import { FIELDS } from '../lib/liveFields.js';

/** Edit a record screen layout ({ map, hero, fields }, see liveFields.js): changes apply at once. */
export default function RecordScreenEditor({ layout, onChange }) {
  const set = (patch) => onChange({ ...layout, ...patch });
  const { hero, fields } = layout;
  const move = (i) => set({ fields: fields.map((f, k) => (k === i - 1 ? fields[i] : k === i ? fields[i - 1] : f)) });
  const free = Object.keys(FIELDS).filter((f) => f !== hero && !fields.includes(f));
  return (
    <div className="screen-editor">
      <label className="switch"><input type="checkbox" checked={layout.map} onChange={(e) => set({ map: e.target.checked })} />{t('Carte en direct')}</label>
      <label className="route-select">
        {t('Valeur principale')}
        <select value={hero} onChange={(e) => set({ hero: e.target.value, fields: fields.map((f) => (f === e.target.value ? hero : f)) })}>
          {Object.entries(FIELDS).map(([id, f]) => <option key={id} value={id}>{f.name}</option>)}
        </select>
      </label>
      <h3 className="small-label">{t('Champs affichés')}</h3>
      <ol className="screen-fields">
        {fields.map((f, i) => (
          <li key={f}>
            <span>{FIELDS[f].name}</span>
            <button type="button" className="ghost icon" onClick={() => move(i)} disabled={i === 0} aria-label={t('Monter')}>↑</button>
            <button type="button" className="ghost icon" onClick={() => set({ fields: fields.filter((x) => x !== f) })} aria-label={t('Retirer|champ')}>✕</button>
          </li>
        ))}
      </ol>
      {free.length > 0 && (
        <select value="" onChange={(e) => set({ fields: [...fields, e.target.value] })} aria-label={t('Ajouter un champ')}>
          <option value="">{t('+ Ajouter un champ')}</option>
          {free.map((id) => <option key={id} value={id}>{FIELDS[id].name}</option>)}
        </select>
      )}
    </div>
  );
}
