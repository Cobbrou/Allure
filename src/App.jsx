import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import TabBar from './components/TabBar.jsx';
import { createActivity } from './lib/activity.js';
import { deleteRoute, deleteSegment, getSetting, listActivities, listRoutes, listSegments, saveActivities, saveRoute, saveSegment, setSetting } from './lib/db.js';
import { demoHistory } from './lib/demo.js';
import { setUnits } from './lib/format.js';
import { deviceLang, getLang, setLang, t, tn } from './lib/i18n.js';
import { newlyUnlocked } from './lib/achievements.js';
import { newlyCompleted } from './lib/challenges.js';
import { goalLabel, newlyReached } from './lib/goals.js';
import { healthTasks, importFiles, importTasks } from './lib/importer.js';
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
  manual: () => import('./pages/ManualPage.jsx'),
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
const ManualPage = lazy(pages.manual);

// Detail pages and where "back" lands when the app was opened on them (deep link).
const BACK_TO = { activity: '/', manual: '/record', log: '/profile', segment: '/profile', route: '/maps', suggest: '/maps' };

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
    const timer = setTimeout(() => Object.values(pages).forEach((load) => load()), 1500);
    return () => clearTimeout(timer);
  }, []);
  const [hrSaved, setHrSaved] = useState(null); // { max?, rest? } set by the athlete
  useEffect(() => { getSetting('hr').then(setHrSaved, () => {}); }, []);
  const [watchRest, setWatchRest] = useState(null); // resting HR measured by the watch (Health Connect)
  // prompt: ask for Health Connect access; without it, only refresh when already granted.
  const syncRestingHr = useCallback(async (prompt) => {
    const health = await import('./lib/health.js');
    if (await health.healthStatus() !== 'ready') return;
    const rest = await health.readRestingHr({ prompt });
    if (rest) { setWatchRest(rest); await setSetting('watchRest', rest); }
  }, []);
  useEffect(() => {
    getSetting('watchRest').then((r) => r && setWatchRest(r), () => {});
    syncRestingHr(false).catch(() => {});
  }, [syncRestingHr]);
  const hr = useMemo(
    () => ({
      max: hrSaved?.max || estimateMaxHr(activities ?? []),
      rest: hrSaved?.rest || watchRest || DEFAULT_REST_HR,
      restFromWatch: !hrSaved?.rest && !!watchRest,
    }),
    [hrSaved, watchRest, activities],
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
    await Promise.all([loadSegments(), reload()]);
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
  const [lang, setLangState] = useState(deviceLang); // 'fr' | 'en'
  useEffect(() => { getSetting('lang').then((l) => l && setLangState(l), () => {}); }, []);
  const saveLang = async (l) => { await setSetting('lang', l); setLangState(l); };
  setLang(lang); // read by t() during render, like the units
  useEffect(() => {
    document.documentElement.lang = getLang();
    document.title = t('Allure — Analyse de course');
  }, [lang]);
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
      const unlocked = prevList.current ? newlyUnlocked(prevList.current, list) : [];
      prevList.current = list;
      setActivities(list);
      const news = [
        ...won.map((g) => t('🎉 Objectif atteint : {goal}', { goal: goalLabel(g) })),
        ...done.map((c) => t('🏆 Défi terminé : {title}', { title: c.title })),
        ...unlocked.map((a) => t('🏅 Succès débloqué : {title}', { title: a.title })),
      ];
      if (news.length) setToast({ kind: 'notice', goal: true, text: news.join(' · ') });
    } catch (e) {
      setToast({ kind: 'error', text: t('Stockage indisponible : {error}', { error: e.message }) });
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const onImport = (files) => files.length && runImport((existing, onProgress) => importFiles(files, existing, onProgress));
  const onHealthImport = () => runImport(async (existing, onProgress) => {
    const { readWorkouts } = await import('./lib/health.js');
    const workouts = await readWorkouts();
    const tasks = healthTasks(workouts);
    await syncRestingHr(true).catch(() => {}); // a missing resting HR never fails the import
    if (!tasks.length) throw new Error(t(workouts.length ? 'Aucune séance avec trace GPS dans Health Connect.' : 'Aucune séance trouvée dans Health Connect.'));
    return importTasks(tasks, existing, onProgress);
  });
  // run(existing, onProgress) imports and returns importTasks' result.
  const runImport = async (run) => {
    if (progress) return;
    setToast(null);
    setProgress({ done: 0, total: 1 });
    try {
      const r = await run(activities ?? [], (done, total) => setProgress({ done, total }));
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
  if (page === 'activity') content = <ActivityPage id={id} activities={activities} hr={hr} ftp={ftp} weight={hrSaved?.weight} zones={zones} segments={segments ?? []} onSegment={addSegment} gears={gears} onChange={reload} />;
  else if (page === 'log') content = <TrainingLogPage activities={activities} hr={hr} />;
  else if (page === 'maps') content = <MapsPage activities={activities} routes={routes} />;
  else if (page === 'suggest') content = <SuggestPage activities={activities} onPick={pickRoute} />;
  else if (page === 'route') content = <RoutePage id={id} activities={activities} onSave={addRoute} onDelete={removeRoute} />;
  else if (page === 'groups' || page === 'challenge') content = <GroupsPage activities={activities} name={prefs.name} incoming={page === 'challenge' ? id : null} />;
  else if (page === 'segment') content = <SegmentPage id={id} segments={segments} activities={activities} onDelete={() => removeSegment(id)} />;
  else if (page === 'record') content = <RecordPage recording={recording} contacts={contacts} routes={routes} routeId={id} segments={segments ?? []} activities={activities ?? []} prefs={prefs} onSavePrefs={savePrefs} onSaved={async (rid) => { await reload(); go(`/activity/${rid}`); }} />;
  else if (page === 'profile') content = <ProfilePage activities={activities} hr={hr} ftp={ftp} name={prefs.name} goals={goals} onSaveGoals={saveGoals} segments={segments ?? []} gears={gears} onSaveGears={saveGears} />;
  else if (page === 'settings') content = <SettingsPage activities={activities} hr={hr} hrSaved={hrSaved} ftpEstimate={ftpEstimate} onSaveHr={saveHr} units={units} onSaveUnits={saveUnits} lang={lang} onSaveLang={saveLang} prefs={prefs} onSavePrefs={savePrefs} zones={zones} onSaveZones={saveZones} contacts={contacts} onSaveContacts={saveContacts} onDemo={addDemo} onHealthImport={onHealthImport} onChange={reload} />;
  else if (page === 'legal') content = <LegalPage id={id} />;
  else if (page === 'manual') content = <ManualPage id={id} activities={activities} onSaved={async (mid) => { await reload(); if (id) back(`/activity/${mid}`); else go(`/activity/${mid}`); }} />;
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
          {t('Import… {done} / {total}', progress)}
          <div className="progress"><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        </div>
      )}
      {!progress && toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
      <ErrorBoundary key={`${page}/${id ?? ''}/${units}/${lang}`}>
        <Suspense fallback={<main className="detail" aria-busy="true" />}>{content}</Suspense>
      </ErrorBoundary>
      {!(page === 'record' && recording.rec) && <TabBar active={page === 'activity' || page === 'segment' ? '' : page === 'manual' ? 'record' : page === 'log' || page === 'settings' || page === 'legal' ? 'profile' : page === 'route' || page === 'suggest' ? 'maps' : page} />}
    </div>
  );
}

function importSummary({ ids, duplicates, failed }) {
  const parts = [tn(ids.length, '{n} activité importée', '{n} activités importées')];
  if (duplicates) parts.push(tn(duplicates, '{n} doublon ignoré', '{n} doublons ignorés'));
  if (failed.length) parts.push(tn(failed.length, '{n} échec ({label} : {error})', '{n} échecs ({label} : {error})', failed[0]));
  return { kind: failed.length && !ids.length ? 'error' : 'notice', text: parts.join(' · ') };
}
