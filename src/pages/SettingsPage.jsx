import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import EmergencyContacts from '../components/EmergencyContacts.jsx';
import HrSettings from '../components/HrSettings.jsx';
import MyData from '../components/MyData.jsx';
import PrivacyZones from '../components/PrivacyZones.jsx';
import Segmented from '../components/Segmented.jsx';
import { deleteActivities } from '../lib/db.js';
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
        </section>
        <section className="card">
          <h3>{t('Enregistrement')}</h3>
          <p className="muted">{t('Réglages par défaut, modifiables avant chaque sortie.')}</p>
          <label className="switch"><input type="checkbox" checked={prefs.autoPause ?? true} onChange={(e) => savePref({ autoPause: e.target.checked })} />{t('Pause automatique')}</label>
          <label className="switch"><input type="checkbox" checked={prefs.audio ?? true} onChange={(e) => savePref({ audio: e.target.checked })} />{t('Annonces vocales')}</label>
        </section>
        <HrSettings hr={hr} ftpEstimate={ftpEstimate} saved={hrSaved} onSave={onSaveHr} />

        <h2 className="settings-group">{t('Confidentialité et sécurité')}</h2>
        <section className="card">
          <h3>{t('Autorisations')}</h3>
          <p><b>{t('Localisation')}</b></p>
          <p className="muted">{PERMISSION[location] ?? PERMISSION.prompt} {t('Utilisée seulement pendant un enregistrement, y compris écran éteint.')}</p>
        </section>
        <PrivacyZones zones={zones} activities={list} onSave={onSaveZones} />
        <EmergencyContacts contacts={contacts} onSave={onSaveContacts} />

        <h2 className="settings-group">{t('Données')}</h2>
        <MyData count={list.length} />
        {health !== 'unsupported' && (
          <section className="card">
            <h3>Health Connect</h3>
            <p className="muted">{t('Importe les sorties enregistrées par ta montre (Pixel Watch, Fitbit…) : course, vélo, rando, marche et nage en eau libre avec trace GPS et fréquence cardiaque. Les séances déjà importées sont ignorées.')}</p>
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
