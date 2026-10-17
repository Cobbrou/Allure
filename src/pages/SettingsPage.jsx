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
  { id: 'metric', label: 'Métrique (km, m)' },
  { id: 'imperial', label: 'Impérial (mi, ft)' },
];

const PERMISSION = {
  granted: 'Autorisée',
  denied: 'Refusée : autorise-la dans les réglages du téléphone pour enregistrer.',
  prompt: 'Demandée au premier enregistrement.',
};

export default function SettingsPage({ activities, hr, hrSaved, ftpEstimate, onSaveHr, units, onSaveUnits, prefs, onSavePrefs, zones, onSaveZones, contacts, onSaveContacts, onDemo, onChange }) {
  const list = activities ?? [];
  const [name, setName] = useState(prefs.name ?? '');
  const [location, setLocation] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(prefs.name ?? ''); }, [prefs.name]);
  useEffect(() => { locationPermission().then(setLocation); }, []);

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
        <a className="back" href="#/profile" aria-label="Retour" onClick={(e) => { e.preventDefault(); back('/profile'); }}>‹</a>
        <h1>Paramètres</h1>
        <span className="back" aria-hidden="true" />
      </header>
      <main className="detail settings">
        <h2 className="settings-group">Compte</h2>
        <section className="card edit">
          <label>Nom affiché
            <input value={name} maxLength={40} placeholder="Athlète Allure" autoComplete="name"
              onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== (prefs.name ?? '') && savePref({ name: name.trim() })} />
          </label>
          <p className="muted">Pas de compte en ligne pour l'instant : tout reste sur ce téléphone.</p>
        </section>

        <h2 className="settings-group">Préférences</h2>
        <section className="card">
          <h3>Unités</h3>
          <Segmented label="Unités" options={UNITS} value={units} onChange={onSaveUnits} />
        </section>
        <section className="card">
          <h3>Enregistrement</h3>
          <p className="muted">Réglages par défaut, modifiables avant chaque sortie.</p>
          <label className="switch"><input type="checkbox" checked={prefs.autoPause ?? true} onChange={(e) => savePref({ autoPause: e.target.checked })} />Pause automatique</label>
          <label className="switch"><input type="checkbox" checked={prefs.audio ?? true} onChange={(e) => savePref({ audio: e.target.checked })} />Annonces vocales</label>
        </section>
        <HrSettings hr={hr} ftpEstimate={ftpEstimate} saved={hrSaved} onSave={onSaveHr} />

        <h2 className="settings-group">Confidentialité et sécurité</h2>
        <section className="card">
          <h3>Autorisations</h3>
          <p><b>Localisation</b></p>
          <p className="muted">{PERMISSION[location] ?? 'Demandée au premier enregistrement.'} Utilisée seulement pendant un enregistrement, y compris écran éteint.</p>
        </section>
        <PrivacyZones zones={zones} activities={list} onSave={onSaveZones} />
        <EmergencyContacts contacts={contacts} onSave={onSaveContacts} />

        <h2 className="settings-group">Données</h2>
        <MyData count={list.length} />
        <section className="card">
          <h3>Données de démo</h3>
          <p className="muted">Ajoute 20 sorties variées (course, vélo, rando) sur les 60 derniers jours pour tester l'app.</p>
          <div className="row">
            <button onClick={generate} disabled={busy}>{busy ? 'Génération…' : 'Générer 20 activités'}</button>
            {demoIds.length > 0 && (
              <ConfirmButton onConfirm={clearDemo}>Supprimer la démo ({demoIds.length})</ConfirmButton>
            )}
          </div>
        </section>

        <h2 className="settings-group">À propos</h2>
        <nav className="card settings-links" aria-label="À propos">
          <a href="#/legal/privacy"><span>Politique de confidentialité</span><span aria-hidden="true">›</span></a>
          <a href="#/legal/terms"><span>Conditions d'utilisation</span><span aria-hidden="true">›</span></a>
          <a href="#/legal/licenses"><span>Licences et crédits</span><span aria-hidden="true">›</span></a>
          <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer"><span>Aide et signaler un problème</span><span aria-hidden="true">↗</span></a>
          <a href={REPO} target="_blank" rel="noopener noreferrer"><span>Code source</span><span aria-hidden="true">↗</span></a>
        </nav>
        <p className="muted settings-version">Allure {version} · logiciel libre (GPL-3.0)</p>
      </main>
    </>
  );
}
