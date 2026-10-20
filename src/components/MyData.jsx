import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import ConfirmButton from './ConfirmButton.jsx';
import { fmtDate } from './ActivityCard.jsx';
import { backupName } from '../lib/backup.js';
import { deleteAllData, exportBackup, getSetting, persistStorage, restoreBackup, setSetting } from '../lib/db.js';
import { shareFile } from '../lib/share.js';

/** Full backup to a JSON file, restore from one, and erase everything on this device. */
export default function MyData({ count }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null); // { at, count } of the last backup
  const [persisted, setPersisted] = useState(null); // false: the browser may evict the data
  useEffect(() => {
    getSetting('backup').then(setLast, () => {});
    persistStorage().then(setPersisted, () => {});
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setStatus('');
    try { await fn(); } catch (e) { setStatus(e.message); } finally { setBusy(false); }
  };

  const save = () => run(async () => {
    const blob = await exportBackup();
    // ponytail: a plain download counts as done; the browser can't say whether it was kept.
    if (await shareFile(blob, backupName()) === false) return;
    const b = { at: Date.now(), count };
    await setSetting('backup', b);
    setLast(b);
  });

  const restore = (file) => run(async () => {
    await restoreBackup(file);
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
      <p className="muted">{last ? t('Dernière sauvegarde : {date}', { date: fmtDate(last.at) }) : t('Aucune sauvegarde pour le moment.')}</p>
      {persisted === false && (
        <p className="record-status bad">{t("Le navigateur peut effacer ces données s'il manque de place : garde une sauvegarde récente.")}</p>
      )}
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
