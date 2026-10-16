import { useCallback, useEffect, useState } from 'react';
import TabBar from './components/TabBar.jsx';
import { createActivity } from './lib/activity.js';
import { listActivities, saveActivities } from './lib/db.js';
import { demoHistory } from './lib/demo.js';
import { importFiles } from './lib/importer.js';
import ActivityPage from './pages/ActivityPage.jsx';
import FeedPage from './pages/FeedPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RecordPage from './pages/RecordPage.jsx';
import { go, useRoute } from './router.js';

export default function App() {
  const [page, id] = useRoute();
  const [activities, setActivities] = useState(null);
  const [toast, setToast] = useState(null); // { kind: 'error' | 'notice', text }
  const [progress, setProgress] = useState(null); // { done, total }
  const [dragging, setDragging] = useState(false);

  const reload = useCallback(
    () => listActivities().then(setActivities, (e) => setToast({ kind: 'error', text: `Stockage indisponible : ${e.message}` })),
    [],
  );
  useEffect(() => { reload(); }, [reload]);

  const onImport = async (files) => {
    if (!files.length || progress) return;
    setToast(null);
    setProgress({ done: 0, total: files.length });
    try {
      const r = await importFiles(files, activities ?? [], (done, total) => setProgress({ done, total }));
      await reload();
      if (r.total === 1 && r.ids.length === 1) return go(`/activity/${r.ids[0]}`);
      setToast(importSummary(r));
    } catch (e) {
      setToast({ kind: 'error', text: e.message });
    } finally {
      setProgress(null);
    }
  };

  const addDemo = async () => {
    await saveActivities(demoHistory().map((h) => createActivity({ ...h, source: 'demo' })));
    await reload();
  };

  let content;
  if (page === 'activity') content = <ActivityPage id={id} onChange={reload} />;
  else if (page === 'record') content = <RecordPage />;
  else if (page === 'profile') content = <ProfilePage activities={activities} onDemo={addDemo} onChange={reload} />;
  else content = <FeedPage activities={activities} onImport={onImport} onDemo={addDemo} />;

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onImport([...e.dataTransfer.files]); }}
    >
      {progress && (
        <div className="toast notice" role="status">
          Import… {progress.done} / {progress.total}
          <div className="progress"><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        </div>
      )}
      {!progress && toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
      {content}
      <TabBar active={page === 'activity' ? '' : page} />
    </div>
  );
}

function importSummary({ ids, duplicates, failed }) {
  const parts = [`${ids.length} activité${ids.length > 1 ? 's' : ''} importée${ids.length > 1 ? 's' : ''}`];
  if (duplicates) parts.push(`${duplicates} doublon${duplicates > 1 ? 's' : ''} ignoré${duplicates > 1 ? 's' : ''}`);
  if (failed.length) parts.push(`${failed.length} échec${failed.length > 1 ? 's' : ''} (${failed[0].label} : ${failed[0].error})`);
  return { kind: failed.length && !ids.length ? 'error' : 'notice', text: parts.join(' · ') };
}
