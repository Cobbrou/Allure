import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import EmergencyContacts from '../components/EmergencyContacts.jsx';
import HrSettings from '../components/HrSettings.jsx';
import MyData from '../components/MyData.jsx';
import PrivacyZones from '../components/PrivacyZones.jsx';
import Segmented from '../components/Segmented.jsx';
import { deleteActivities } from '../lib/db.js';
import { FIELDS } from '../lib/liveFields.js';
import { VOICE, VOICE_EVERY, VOICE_FIELDS } from '../lib/recorder.js';
import { displayOf, SPORTS } from '../lib/sports.js';
import { ACCENT, ACCENTS } from '../theme.js';
import { locationPermission } from '../lib/location.js';
import { back } from '../router.js';
import { version } from '../../package.json';

const REPO = 'https://github.com/Cobbrou/Allure';

const UNITS = [
  { id: 'metric', get label() { return t('Métrique (km, m)'); } },
  { id: 'imperial', get label() { return t('Impérial (mi, ft)'); } },
];

// Each language is named in itself.
const LANGUAGES = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

const THEMES = [
  { id: 'system', get label() { return t('Système'); } },
  { id: 'dark', get label() { return t('Sombre'); } },
  { id: 'light', get label() { return t('Clair'); } },
];

// Carto basemaps (theme.js MAP_STYLES); 'auto' follows the theme.
const MAPS = [
  { id: 'auto', get label() { return t('Auto'); } },
  { id: 'dark', get label() { return t('Sombre'); } },
  { id: 'light', get label() { return t('Clair'); } },
  { id: 'color', get label() { return t('Couleurs'); } },
];

const WEEK_STARTS = [
  { id: 1, get label() { return t('Lundi'); } },
  { id: 0, get label() { return t('Dimanche'); } },
];

const EFFORTS = [
  { id: 'pace', get label() { return t('Allure'); } },
  { id: 'speed', get label() { return t('Vitesse'); } },
];

const voiceEvery = () => VOICE_EVERY.map((id) => ({ id, label: id === 'split' ? t('Chaque split') : t('{n} min', { n: id / 60 }) }));

const PERMISSION = {
  get granted() { return t('Autorisée'); },
  get denied() { return t('Refusée : autorise-la dans les réglages du téléphone pour enregistrer.'); },
  get prompt() { return t('Demandée au premier enregistrement.'); },
};

export default function SettingsPage({ activities, hr, hrSaved, ftpEstimate, onSaveHr, units, onSaveUnits, lang, onSaveLang, prefs, onSavePrefs, zones, onSaveZones, contacts, onSaveContacts, onDemo, onHealthImport, onChange }) {
  const list = activities ?? [];
  const [name, setName] = useState(prefs.name ?? '');
  const [location, setLocation] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(prefs.name ?? ''); }, [prefs.name]);
  useEffect(() => { locationPermission().then(setLocation); }, []);
  const [health, setHealth] = useState('unsupported');
  useEffect(() => { import('../lib/health.js').then((m) => m.healthStatus()).then(setHealth); }, []);

  const savePref = (patch) => onSavePrefs({ ...prefs, ...patch });
  const demoIds = list.filter((a) => a.source === 'demo').map((a) => a.id);
  const generate = async () => {
    setBusy(true);
    try { await onDemo(); } finally { setBusy(false); }
  };
  const clearDemo = async () => {
    await deleteActivities(demoIds);
    onChange();
  };

  return (
    <>
      <header className="topbar">
        <a className="back" href="#/profile" aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back('/profile'); }}>‹</a>
        <h1>{t('Paramètres')}</h1>
        <span className="back" aria-hidden="true" />
      </header>
      <main className="detail settings">
        <h2 className="settings-group">{t('Compte')}</h2>
        <section className="card edit">
          <label>{t('Nom affiché')}
            <input value={name} maxLength={40} placeholder={t('Athlète Allure')} autoComplete="name"
              onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== (prefs.name ?? '') && savePref({ name: name.trim() })} />
          </label>
          <p className="muted">{t("Pas de compte en ligne pour l'instant : tout reste sur ce téléphone.")}</p>
        </section>

        <h2 className="settings-group">{t('Préférences')}</h2>
        <section className="card">
          <h3>{t('Langue')}</h3>
          <Segmented label={t('Langue')} options={LANGUAGES} value={lang} onChange={onSaveLang} />
        </section>
        <section className="card">
          <h3>{t('Unités')}</h3>
          <Segmented label={t('Unités')} options={UNITS} value={units} onChange={onSaveUnits} />
          <h3 className="small-label">{t('Allure ou vitesse')}</h3>
          {['run', 'ride', 'hike', 'walk'].map((id) => (
            <div key={id} className="settings-row">
              <span>{SPORTS[id].label}</span>
              <Segmented label={SPORTS[id].label} options={EFFORTS} value={displayOf(id)} onChange={(v) => savePref({ display: { ...prefs.display, [id]: v } })} />
            </div>
          ))}
          <h3 className="small-label">{t('Début de semaine')}</h3>
          <Segmented label={t('Début de semaine')} options={WEEK_STARTS} value={prefs.weekStart === 0 ? 0 : 1} onChange={(v) => savePref({ weekStart: v })} />
        </section>
        <section className="card">
          <h3>{t('Apparence')}</h3>
          <h3 className="small-label">{t('Thème')}</h3>
          <Segmented label={t('Thème')} options={THEMES} value={prefs.theme ?? 'dark'} onChange={(v) => savePref({ theme: v })} />
          <h3 className="small-label">{t("Couleur d'accent")}</h3>
          <div className="swatches" role="radiogroup" aria-label={t("Couleur d'accent")}>
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={a.id === ACCENT} aria-label={a.label} title={a.label}
                style={{ background: a.id }} onClick={() => savePref({ accent: a.id })} />
            ))}
          </div>
          <h3 className="small-label">{t('Carte')}</h3>
          <Segmented label={t('Carte')} options={MAPS} value={prefs.map ?? 'auto'} onChange={(v) => savePref({ map: v })} />
        </section>
        <section className="card">
          <h3>{t('Enregistrement')}</h3>
          <p className="muted">{t('Réglages par défaut, modifiables avant chaque sortie.')}</p>
          <label className="switch"><input type="checkbox" checked={prefs.autoPause ?? true} onChange={(e) => savePref({ autoPause: e.target.checked })} />{t('Pause automatique')}</label>
          <label className="switch"><input type="checkbox" checked={prefs.audio ?? true} onChange={(e) => savePref({ audio: e.target.checked })} />{t('Annonces vocales')}</label>
          {(prefs.audio ?? true) && <VoiceSettings voice={{ ...VOICE, ...prefs.voice }} onChange={(voice) => savePref({ voice })} />}
        </section>
        <HrSettings hr={hr} ftpEstimate={ftpEstimate} saved={hrSaved} onSave={onSaveHr} />

        <h2 className="settings-group">{t('Confidentialité et sécurité')}</h2>
        <section className="card">
          <h3>{t('Autorisations')}</h3>
          <p><b>{t('Localisation')}</b></p>
          <p className="muted">{PERMISSION[location] ?? PERMISSION.prompt} {t("Pendant un enregistrement, y compris écran éteint, et pour te situer sur la carte quand l'app est ouverte.")}</p>
        </section>
        <PrivacyZones zones={zones} activities={list} onSave={onSaveZones} />
        <EmergencyContacts contacts={contacts} onSave={onSaveContacts} />

        <h2 className="settings-group">{t('Données')}</h2>
        <MyData count={list.length} />
        {health !== 'unsupported' && (
          <section className="card">
            <h3>Health Connect</h3>
            <p className="muted">{t('Importe les séances enregistrées par ta montre (Pixel Watch, Fitbit…) : course, vélo, rando, marche et natation, avec trace GPS et fréquence cardiaque, ou en salle sans trace. Les séances déjà importées sont ignorées.')}</p>
            {health === 'missing'
              ? <button onClick={async () => { const { installHealthConnect } = await import('../lib/health.js'); installHealthConnect(); }}>{t('Installer Health Connect')}</button>
              : <button onClick={onHealthImport}>{t('Importer depuis Health Connect')}</button>}
          </section>
        )}
        <section className="card">
          <h3>{t('Données de démo')}</h3>
          <p className="muted">{t("Ajoute 20 sorties variées (course, vélo, rando) sur les 60 derniers jours pour tester l'app.")}</p>
          <div className="row">
            <button onClick={generate} disabled={busy}>{t(busy ? 'Génération…' : 'Générer 20 activités')}</button>
            {demoIds.length > 0 && (
              <ConfirmButton onConfirm={clearDemo}>{t('Supprimer la démo ({n})', { n: demoIds.length })}</ConfirmButton>
            )}
          </div>
        </section>

        <h2 className="settings-group">{t('À propos')}</h2>
        <nav className="card settings-links" aria-label={t('À propos')}>
          <a href="#/legal/privacy"><span>{t('Politique de confidentialité')}</span><span aria-hidden="true">›</span></a>
          <a href="#/legal/terms"><span>{t("Conditions d'utilisation")}</span><span aria-hidden="true">›</span></a>
          <a href="#/legal/licenses"><span>{t('Licences et crédits')}</span><span aria-hidden="true">›</span></a>
          <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer"><span>{t('Aide et signaler un problème')}</span><span aria-hidden="true">↗</span></a>
          <a href={REPO} target="_blank" rel="noopener noreferrer"><span>{t('Code source')}</span><span aria-hidden="true">↗</span></a>
        </nav>
        <p className="muted settings-version">Allure {version} · {t('logiciel libre (GPL-3.0)')}</p>
      </main>
    </>
  );
}

/** When the voice announcements speak, and what they say, in the fields' order. */
function VoiceSettings({ voice, onChange }) {
  const toggle = (f, on) => onChange({ ...voice, fields: on ? VOICE_FIELDS.filter((x) => x === f || voice.fields.includes(x)) : voice.fields.filter((x) => x !== f) });
  return (
    <>
      <h3 className="small-label">{t('Fréquence')}</h3>
      <Segmented label={t('Fréquence')} options={voiceEvery()} value={voice.every} onChange={(every) => onChange({ ...voice, every })} />
      <h3 className="small-label">{t('Contenu')}</h3>
      {VOICE_FIELDS.map((f) => (
        <label key={f} className="switch"><input type="checkbox" checked={voice.fields.includes(f)} onChange={(e) => toggle(f, e.target.checked)} />{FIELDS[f].name}</label>
      ))}
      <div className="edit">
        <label>{t('Alerte si le cardio dépasse (bpm)')}
          <input type="number" inputMode="numeric" min="80" max="230" placeholder={t('Désactivée')} value={voice.hrHigh ?? ''}
            onChange={(e) => onChange({ ...voice, hrHigh: +e.target.value || null })} />
        </label>
      </div>
    </>
  );
}
