import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import TabBar from './components/TabBar.jsx';
import { createActivity } from './lib/activity.js';
import { getSetting, listActivities, saveActivities, setSetting } from './lib/db.js';
import { demoHistory } from './lib/demo.js';
import { goalLabel, newlyReached } from './lib/goals.js';
import { importFiles } from './lib/importer.js';
import { DEFAULT_REST_HR, estimateMaxHr } from './lib/training.js';
import FeedPage from './pages/FeedPage.jsx';
import { useRecording } from './recording.js';
import { go, useRoute } from './router.js';

// The feed is the start screen and ships in the main chunk. The other pages pull in
// MapLibre and Recharts, so they load as separate chunks, fetched once the app is idle.
const pages = {
  activity: () => import('./pages/ActivityPage.jsx'),
  record: () => import('./pages/RecordPage.jsx'),
  profile: () => import('./pages/ProfilePage.jsx'),
  log: () => import('./pages/TrainingLogPage.jsx'),
  heatmap: () => import('./pages/HeatmapPage.jsx'),
};
const ActivityPage = lazy(pages.activity);
const RecordPage = lazy(pages.record);
const ProfilePage = lazy(pages.profile);
const TrainingLogPage = lazy(pages.log);
const HeatmapPage = lazy(pages.heatmap);

export default function App() {
  const [page, id] = useRoute();
  const [activities, setActivities] = useState(null);
  const [toast, setToast] = useState(null); // { kind: 'error' | 'notice', text }
  const [progress, setProgress] = useState(null); // { done, total }
  const [dragging, setDragging] = useState(false);
  const recording = useRecording();
  useEffect(() => {
    const t = setTimeout(() => Object.values(pages).forEach((load) => load()), 1500);
    return () => clearTimeout(t);
  }, []);
  const [hrSaved, setHrSaved] = useState(null); // { max?, rest? } set by the athlete
  useEffect(() => { getSetting('hr').then(setHrSaved, () => {}); }, []);
  const hr = useMemo(
    () => ({ max: hrSaved?.max || estimateMaxHr(activities ?? []), rest: hrSaved?.rest || DEFAULT_REST_HR }),
    [hrSaved, activities],
  );
  const saveHr = async (v) => { await setSetting('hr', v); setHrSaved(v); };
  const [goals, setGoals] = useState([]);
  useEffect(() => { getSetting('goals').then((g) => g && setGoals(g), () => {}); }, []);
  const saveGoals = async (g) => { await setSetting('goals', g); setGoals(g); };

  // Reloading after a save, import or demo is when a goal can be crossed: celebrate it.
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const prevList = useRef(null);
  const reload = useCallback(async () => {
    try {
      const list = await listActivities();
      const won = prevList.current ? newlyReached(goalsRef.current, prevList.current, list) : [];
      prevList.current = list;
      setActivities(list);
      if (won.length) setToast({ kind: 'notice', goal: true, text: `🎉 Objectif atteint : ${won.map(goalLabel).join(' · ')}` });
    } catch (e) {
      setToast({ kind: 'error', text: `Stockage indisponible : ${e.message}` });
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const onImport = async (files) => {
    if (!files.length || progress) return;
    setToast(null);
    setProgress({ done: 0, total: files.length });
    try {
      const r = await importFiles(files, activities ?? [], (done, total) => setProgress({ done, total }));
      await reload();
      if (r.total === 1 && r.ids.length === 1) return go(`/activity/${r.ids[0]}`);
      const summary = importSummary(r);
      setToast((cur) => (cur?.goal ? { ...summary, text: `${summary.text}
${cur.text}` } : summary));
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
  if (page === 'activity') content = <ActivityPage id={id} activities={activities} hr={hr} onChange={reload} />;
  else if (page === 'log') content = <TrainingLogPage activities={activities} hr={hr} />;
  else if (page === 'heatmap') content = <HeatmapPage activities={activities} />;
  else if (page === 'record') content = <RecordPage recording={recording} onSaved={async (rid) => { await reload(); go(`/activity/${rid}`); }} />;
  else if (page === 'profile') content = <ProfilePage activities={activities} hr={hr} hrSaved={hrSaved} onSaveHr={saveHr} goals={goals} onSaveGoals={saveGoals} onDemo={addDemo} onChange={reload} />;
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
      <ErrorBoundary key={`${page}/${id ?? ''}`}>
        <Suspense fallback={<main className="detail" aria-busy="true" />}>{content}</Suspense>
      </ErrorBoundary>
      <TabBar active={page === 'activity' ? '' : page === 'log' || page === 'heatmap' ? 'profile' : page} />
    </div>
  );
}

function importSummary({ ids, duplicates, failed }) {
  const parts = [`${ids.length} activité${ids.length > 1 ? 's' : ''} importée${ids.length > 1 ? 's' : ''}`];
  if (duplicates) parts.push(`${duplicates} doublon${duplicates > 1 ? 's' : ''} ignoré${duplicates > 1 ? 's' : ''}`);
  if (failed.length) parts.push(`${failed.length} échec${failed.length > 1 ? 's' : ''} (${failed[0].label} : ${failed[0].error})`);
  return { kind: failed.length && !ids.length ? 'error' : 'notice', text: parts.join(' · ') };
}
