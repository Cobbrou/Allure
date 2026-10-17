import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import TabBar from './components/TabBar.jsx';
import { createActivity } from './lib/activity.js';
import { deleteRoute, deleteSegment, getSetting, listActivities, listRoutes, listSegments, saveActivities, saveRoute, saveSegment, setSetting } from './lib/db.js';
import { demoHistory } from './lib/demo.js';
import { setUnits } from './lib/format.js';
import { newlyCompleted } from './lib/challenges.js';
import { goalLabel, newlyReached } from './lib/goals.js';
import { importFiles } from './lib/importer.js';
import { estimateFtp } from './lib/power.js';
import { DEFAULT_REST_HR, estimateMaxHr } from './lib/training.js';
import { useEdgeSwipeBack } from './gestures.js';
import FeedPage from './pages/FeedPage.jsx';
import { useRecording } from './recording.js';
import { back, go, useRoute } from './router.js';

// The feed is the start screen and ships in the main chunk. The other pages pull in
// MapLibre and Recharts, so they load as separate chunks, fetched once the app is idle.
const pages = {
  activity: () => import('./pages/ActivityPage.jsx'),
  record: () => import('./pages/RecordPage.jsx'),
  profile: () => import('./pages/ProfilePage.jsx'),
  log: () => import('./pages/TrainingLogPage.jsx'),
  maps: () => import('./pages/MapsPage.jsx'),
  groups: () => import('./pages/GroupsPage.jsx'),
  route: () => import('./pages/RoutePage.jsx'),
  suggest: () => import('./pages/SuggestPage.jsx'),
  segment: () => import('./pages/SegmentPage.jsx'),
  settings: () => import('./pages/SettingsPage.jsx'),
  legal: () => import('./pages/LegalPage.jsx'),
};
const ActivityPage = lazy(pages.activity);
const RecordPage = lazy(pages.record);
const ProfilePage = lazy(pages.profile);
const TrainingLogPage = lazy(pages.log);
const MapsPage = lazy(pages.maps);
const GroupsPage = lazy(pages.groups);
const RoutePage = lazy(pages.route);
const SuggestPage = lazy(pages.suggest);
const SegmentPage = lazy(pages.segment);
const SettingsPage = lazy(pages.settings);
const LegalPage = lazy(pages.legal);

// Detail pages and where "back" lands when the app was opened on them (deep link).
const BACK_TO = { activity: '/', log: '/profile', segment: '/profile', route: '/maps', suggest: '/maps' };

export default function App() {
  const [page, id] = useRoute();
  const swipeBack = useCallback(() => back(BACK_TO[page]), [page]);
  useEdgeSwipeBack(page in BACK_TO, swipeBack);
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
  const ftpEstimate = useMemo(() => estimateFtp(activities ?? []), [activities]);
  const ftp = useMemo(
    () => (hrSaved?.ftp ? { watts: hrSaved.ftp, manual: true } : ftpEstimate && { watts: ftpEstimate, manual: false }),
    [hrSaved, ftpEstimate],
  );
  const saveHr = async (v) => { await setSetting('hr', v); setHrSaved(v); };
  const [goals, setGoals] = useState([]);
  useEffect(() => { getSetting('goals').then((g) => g && setGoals(g), () => {}); }, []);
  const [segments, setSegments] = useState(null);
  const loadSegments = () => listSegments().then(setSegments, () => setSegments([]));
  useEffect(() => { loadSegments(); }, []);
  // A new segment adds efforts to existing metas: reload both.
  const addSegment = async (seg) => { await saveSegment(seg); await Promise.all([loadSegments(), reload()]); };
  const removeSegment = async (sid) => {
    await deleteSegment(sid);
    await loadSegments();
    back('/profile');
  };
  const [routes, setRoutes] = useState(null);
  const loadRoutes = () => listRoutes().then(setRoutes, () => setRoutes([]));
  useEffect(() => { loadRoutes(); }, []);
  const addRoute = async (r) => { await saveRoute(r); await loadRoutes(); back('/maps'); };
  const pickRoute = async (r) => { await saveRoute(r); await loadRoutes(); go(`/route/${r.id}`); };
  const removeRoute = async (rid) => { await deleteRoute(rid); await loadRoutes(); back('/maps'); };
  const saveGoals = async (g) => { await setSetting('goals', g); setGoals(g); };
  const [zones, setZones] = useState([]); // privacy zones
  useEffect(() => { getSetting('privacy').then((z) => z && setZones(z), () => {}); }, []);
  const saveZones = async (z) => { await setSetting('privacy', z); setZones(z); };
  const [contacts, setContacts] = useState([]); // emergency contacts
  useEffect(() => { getSetting('contacts').then((c) => c && setContacts(c), () => {}); }, []);
  const saveContacts = async (c) => { await setSetting('contacts', c); setContacts(c); };
  const [units, setUnitsState] = useState('metric'); // 'metric' | 'imperial'
  useEffect(() => { getSetting('units').then((u) => u && setUnitsState(u), () => {}); }, []);
  const saveUnits = async (u) => { await setSetting('units', u); setUnitsState(u); };
  setUnits(units); // read by format.js during render; the page remounts on change (key below)
  const [prefs, setPrefs] = useState({}); // { name?, autoPause?, audio? }
  useEffect(() => { getSetting('prefs').then((p) => p && setPrefs(p), () => {}); }, []);
  const savePrefs = async (p) => { await setSetting('prefs', p); setPrefs(p); };
  const [gears, setGears] = useState([]);
  useEffect(() => { getSetting('gear').then((g) => g && setGears(g), () => {}); }, []);
  const saveGears = async (g) => { await setSetting('gear', g); setGears(g); };

  // Reloading after a save, import or demo is when a goal can be crossed: celebrate it.
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const prevList = useRef(null);
  const reload = useCallback(async () => {
    try {
      const list = await listActivities();
      const won = prevList.current ? newlyReached(goalsRef.current, prevList.current, list) : [];
      const done = prevList.current ? newlyCompleted(prevList.current, list) : [];
      prevList.current = list;
      setActivities(list);
      const news = [...won.map((g) => `🎉 Objectif atteint : ${goalLabel(g)}`), ...done.map((c) => `🏆 Défi terminé : ${c.title}`)];
      if (news.length) setToast({ kind: 'notice', goal: true, text: news.join(' · ') });
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
  if (page === 'activity') content = <ActivityPage id={id} activities={activities} hr={hr} ftp={ftp} zones={zones} segments={segments ?? []} onSegment={addSegment} gears={gears} onChange={reload} />;
  else if (page === 'log') content = <TrainingLogPage activities={activities} hr={hr} />;
  else if (page === 'maps') content = <MapsPage activities={activities} routes={routes} />;
  else if (page === 'suggest') content = <SuggestPage activities={activities} onPick={pickRoute} />;
  else if (page === 'route') content = <RoutePage id={id} routes={routes} activities={activities} onSave={addRoute} onDelete={removeRoute} />;
  else if (page === 'groups') content = <GroupsPage activities={activities} />;
  else if (page === 'segment') content = <SegmentPage id={id} segments={segments} activities={activities} onDelete={() => removeSegment(id)} />;
  else if (page === 'record') content = <RecordPage recording={recording} contacts={contacts} routes={routes} routeId={id} segments={segments ?? []} activities={activities ?? []} prefs={prefs} onSaved={async (rid) => { await reload(); go(`/activity/${rid}`); }} />;
  else if (page === 'profile') content = <ProfilePage activities={activities} hr={hr} ftp={ftp} name={prefs.name} goals={goals} onSaveGoals={saveGoals} segments={segments ?? []} gears={gears} onSaveGears={saveGears} />;
  else if (page === 'settings') content = <SettingsPage activities={activities} hr={hr} hrSaved={hrSaved} ftpEstimate={ftpEstimate} onSaveHr={saveHr} units={units} onSaveUnits={saveUnits} prefs={prefs} onSavePrefs={savePrefs} zones={zones} onSaveZones={saveZones} contacts={contacts} onSaveContacts={saveContacts} onDemo={addDemo} onChange={reload} />;
  else if (page === 'legal') content = <LegalPage id={id} />;
  else content = <FeedPage activities={activities} zones={zones} onRefresh={reload} onImport={onImport} onDemo={addDemo} />;

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
      <ErrorBoundary key={`${page}/${id ?? ''}/${units}`}>
        <Suspense fallback={<main className="detail" aria-busy="true" />}>{content}</Suspense>
      </ErrorBoundary>
      {!(page === 'record' && recording.rec) && <TabBar active={page === 'activity' || page === 'segment' ? '' : page === 'log' || page === 'settings' || page === 'legal' ? 'profile' : page === 'route' || page === 'suggest' ? 'maps' : page} />}
    </div>
  );
}

function importSummary({ ids, duplicates, failed }) {
  const parts = [`${ids.length} activité${ids.length > 1 ? 's' : ''} importée${ids.length > 1 ? 's' : ''}`];
  if (duplicates) parts.push(`${duplicates} doublon${duplicates > 1 ? 's' : ''} ignoré${duplicates > 1 ? 's' : ''}`);
  if (failed.length) parts.push(`${failed.length} échec${failed.length > 1 ? 's' : ''} (${failed[0].label} : ${failed[0].error})`);
  return { kind: failed.length && !ids.length ? 'error' : 'notice', text: parts.join(' · ') };
}
