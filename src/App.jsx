import { useCallback, useEffect, useState } from 'react';
import TabBar from './components/TabBar.jsx';
import { createActivity } from './lib/activity.js';
import { listActivities, saveActivities } from './lib/db.js';
import { demoHistory } from './lib/demo.js';
import { parseGpx } from './lib/gpx.js';
import { go, useRoute } from './router.js';
import { sportFromGpxType } from './lib/sports.js';
import ActivityPage from './pages/ActivityPage.jsx';
import FeedPage from './pages/FeedPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RecordPage from './pages/RecordPage.jsx';

export default function App() {
  const [page, id] = useRoute();
  const [activities, setActivities] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const reload = useCallback(
    () => listActivities().then(setActivities, (e) => setError(`Stockage indisponible : ${e.message}`)),
    [],
  );
  useEffect(() => { reload(); }, [reload]);

  const importFile = async (file) => {
    if (!file) return;
    setError('');
    if (!/\.gpx$/i.test(file.name)) return setError('Format non supporté : choisis un fichier .gpx');
    try {
      const { name, type, points } = parseGpx(await file.text());
      const item = createActivity({ name, sport: sportFromGpxType(type), points });
      await saveActivities([item]);
      await reload();
      go(`/activity/${item.meta.id}`);
    } catch (e) {
      setError(e.message);
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
  else content = <FeedPage activities={activities} onImport={importFile} onDemo={addDemo} />;

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files[0]); }}
    >
      {error && <div className="error" role="alert" onClick={() => setError('')}>{error}</div>}
      {content}
      <TabBar active={page === 'activity' ? '' : page} />
    </div>
  );
}
