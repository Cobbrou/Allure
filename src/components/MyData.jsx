import { t } from '../lib/i18n.js';
import { useState } from 'react';
import ConfirmButton from './ConfirmButton.jsx';
import { backupName, makeBackup, parseBackup } from '../lib/backup.js';
import { VERSION, deleteAllData, exportAll, restoreAll } from '../lib/db.js';
import { shareFile } from '../lib/share.js';

/** Full backup to a JSON file, restore from one, and erase everything on this device. */
export default function MyData({ count }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setStatus('');
    try { await fn(); } catch (e) { setStatus(e.message); } finally { setBusy(false); }
  };

  const save = () => run(async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(makeBackup(data))], { type: 'application/json' });
    await shareFile(blob, backupName());
  });

  const restore = (file) => run(async () => {
    const data = parseBackup(await file.text(), VERSION);
    await restoreAll(data);
    location.reload(); // settings and lists are loaded once at startup
  });

  const wipe = () => run(async () => {
    await deleteAllData();
    await (await import('../lib/offline.js')).removeAllOffline();
    location.replace('#/');
    location.reload();
  });

  return (
    <section className="card">
      <h3>{t('Mes données')}</h3>
      <p className="muted">
        {t('Tout est stocké sur cet appareil. La sauvegarde regroupe tes {n} activités avec leurs traces et photos, réglages, segments et itinéraires dans un fichier à garder ou à restaurer sur un autre téléphone.', { n: count })}
      </p>
      <div className="row">
        <button type="button" className="ghost" onClick={save} disabled={busy}>{t('Sauvegarder')}</button>
        <label className="button ghost">
          {t('Restaurer')}
          <input type="file" accept=".json,application/json" hidden disabled={busy}
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(f); }} />
        </label>
        <ConfirmButton onConfirm={wipe} confirmLabel={t('Tout effacer ?')}>{t('Supprimer mes données')}</ConfirmButton>
      </div>
      {status && <p className="record-status bad" role="alert">{status}</p>}
    </section>
  );
}
