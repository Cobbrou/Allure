import { Capacitor } from '@capacitor/core';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import TabBar from './components/TabBar.jsx';
import { addWatchHr, createActivity, needsWatchHr } from './lib/activity.js';
import { backupDue } from './lib/backup.js';
import { deleteRoute, deleteSegment, getActivity, getSetting, listActivities, listRoutes, listSegments, persistStorage, saveActivities, saveRoute, saveSegment, setSetting } from './lib/db.js';
import { setUnits } from './lib/format.js';
import { deviceLang, getLang, setLang, t, tn } from './lib/i18n.js';
import { newlyUnlocked } from './lib/achievements.js';
import { newlyCompleted } from './lib/challenges.js';
import { goalLabel, newlyReached } from './lib/goals.js';
import { healthTasks, importFiles, importTasks } from './lib/importer.js';
import { extendPlan, matchSessions } from './lib/plan.js';
import { estimateFtp } from './lib/power.js';
import { setDisplays } from './lib/sports.js';
import { forTraining, setWeekStart } from './lib/stats.js';
import { DEFAULT_REST_HR, estimateMaxHr } from './lib/training.js';
import { useEdgeSwipeBack } from './gestures.js';
import FeedPage from './pages/FeedPage.jsx';
import HomePage from './pages/HomePage.jsx';
import { useRecording } from './recording.js';
import { back, go, useRoute } from './router.js';
import { ACCENT, MAP_STYLE, setTheme } from './theme.js';

// Home (the training hub) is the start screen and ships in the main chunk with the feed. The
// other pages pull in MapLibre and Recharts, so they load as separate chunks, fetched once the app is idle.
const pages = {
  activity: () => import('./pages/ActivityPage.jsx'),
  record: () => import('./pages/RecordPage.jsx'),
  profile: () => import('./pages/ProfilePage.jsx'),
  log: () => import('./pages/TrainingLogPage.jsx'),
  maps: () => import('./pages/MapsPage.jsx'),
  groups: () => import('./pages/GroupsPage.jsx'),
  route: () => import('./pages/RoutePage.jsx'),
  segment: () => import('./pages/SegmentPage.jsx'),
  settings: () => import('./pages/SettingsPage.jsx'),
  legal: () => import('./pages/LegalPage.jsx'),
  manual: () => import('./pages/ManualPage.jsx'),
  plan: () => import('./pages/PlanPage.jsx'),
  planSetup: () => import('./pages/PlanSetupPage.jsx'),
};
const ActivityPage = lazy(pages.activity);
const RecordPage = lazy(pages.record);
const ProfilePage = lazy(pages.profile);
const TrainingLogPage = lazy(pages.log);
const MapsPage = lazy(pages.maps);
const GroupsPage = lazy(pages.groups);
const RoutePage = lazy(pages.route);
const SegmentPage = lazy(pages.segment);
const SettingsPage = lazy(pages.settings);
const LegalPage = lazy(pages.legal);
const ManualPage = lazy(pages.manual);
const PlanPage = lazy(pages.plan);
const PlanSetupPage = lazy(pages.planSetup);

// Detail pages and where "back" lands when the app was opened on them (deep link).
const BACK_TO = { plan: '/', activities: '/profile', activity: '/activities', manual: '/record', log: '/profile', segment: '/profile', route: '/maps', settings: '/profile', legal: '/settings' };

/** A stored setting as state: [value, save]. `initial` until loaded, or when never saved. */
function useSetting(key, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => { getSetting(key).then((v) => v != null && setValue(v), () => {}); }, [key]);
  const save = useCallback(async (v) => { await setSetting(key, v); setValue(v); }, [key]);
  return [value, save];
}

export default function App() {
  const [page, id, sub] = useRoute();
  const swipeBack = useCallback(() => back(BACK_TO[page]), [page]);
  useEdgeSwipeBack(page in BACK_TO, swipeBack);
  const [activities, setActivities] = useState(null);
  const [toast, setToast] = useState(null); // { kind: 'error' | 'notice', text }
  const [progress, setProgress] = useState(null); // { done, total }
  const [dragging, setDragging] = useState(false);
  const recording = useRecording({
    onSensorLost: (kind) => setToast({ kind: 'error', text: kind === 'hr' ? t('Ceinture cardio perdue : reconnecte-la depuis l’écran d’enregistrement.') : t('Capteur perdu : reconnecte-le depuis l’écran d’enregistrement.') }),
  });
  // Safety net: an async failure nobody caught still says something.
  useEffect(() => {
    const onReject = (e) => {
      const err = e.reason;
      if (err?.name === 'AbortError' || err?.name === 'NotFoundError') return; // share sheet or device picker closed
      setToast({ kind: 'error', text: t('Une erreur est survenue : {error}', { error: err?.message ?? String(err) }) });
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => Object.values(pages).forEach((load) => load()), 1500);
    return () => clearTimeout(timer);
  }, []);
  const [hrSaved, saveHr] = useSetting('hr', null); // { max?, rest?, ftp?, weight? } set by the athlete
  const [watchRest, saveWatchRest] = useSetting('watchRest', null); // resting HR measured by the watch (Health Connect)
  // prompt: ask for Health Connect access; without it, only refresh when already granted.
  const syncRestingHr = useCallback(async (prompt) => {
    const health = await import('./lib/health.js');
    if (await health.healthStatus() !== 'ready') return;
    const rest = await health.readRestingHr({ prompt });
    if (rest) await saveWatchRest(rest);
  }, [saveWatchRest]);
  useEffect(() => { syncRestingHr(false).catch(() => {}); }, [syncRestingHr]);
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
  const [goals, saveGoals] = useSetting('goals', []);
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
  const keepRoute = async (r) => { await saveRoute(r); await loadRoutes(); };
  const removeRoute = async (rid) => { await deleteRoute(rid); await loadRoutes(); back('/maps'); };
  const [zones, saveZones] = useSetting('privacy', []); // privacy zones
  const [contacts, saveContacts] = useSetting('contacts', []); // emergency contacts
  const [units, saveUnits] = useSetting('units', 'metric'); // 'metric' | 'imperial'
  setUnits(units); // read by format.js during render; the page remounts on change (key below)
  const [lang, saveLang] = useSetting('lang', deviceLang); // 'fr' | 'en'
  setLang(lang); // read by t() during render, like the units
  useEffect(() => {
    document.documentElement.lang = getLang();
    document.title = t('Allure — Analyse de course');
  }, [lang]);
  const [prefs, savePrefs] = useSetting('prefs', {}); // { name?, autoPause?, audio?, voice?, sport?, recordScreen?, theme?, accent?, map?, weekStart?, display?, commuteOut? }
  const counted = useMemo(() => activities && forTraining(activities, prefs.commuteOut), [activities, prefs.commuteOut]);
  const [systemLight, setSystemLight] = useState(() => matchMedia('(prefers-color-scheme: light)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemLight(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const light = prefs.theme === 'light' || (prefs.theme === 'system' && systemLight);
  // Read by theme.js, stats.js and sports.js during render, like the units; the page remounts on change.
  setTheme({ light, accent: prefs.accent, map: prefs.map });
  setWeekStart(prefs.weekStart);
  setDisplays(prefs.display);
  const look = `${light}/${ACCENT}/${MAP_STYLE}/${prefs.weekStart}/${JSON.stringify(prefs.display ?? {})}`;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = light ? 'light' : 'dark';
    root.style.setProperty('--accent', ACCENT);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
    if (Capacitor.isNativePlatform()) import('./lib/shell.js').then((m) => m.systemBars(light));
  }, [light, prefs.accent]);
  const [gears, saveGears] = useSetting('gear', []);
  const [plan, savePlan] = useSetting('plan', null); // active training plan (lib/plan.js)
  useEffect(() => { // fitness plans roll on, a block at a time
    const next = plan && extendPlan(plan, Date.now());
    if (next && next !== plan) savePlan(next);
  }, [plan]);
  useEffect(() => { // morning reminders follow the plan and what was run
    if (!Capacitor.isNativePlatform() || !activities) return;
    import('./lib/reminders.js').then((m) => m.scheduleReminders(plan, plan && matchSessions(plan, activities))).catch(() => {});
  }, [plan, activities]);
  // Finished or stopped plans move to 'planHistory'.
  const endPlan = async (status) => {
    const history = (await getSetting('planHistory')) ?? [];
    await setSetting('planHistory', [...history, { ...plan, ended: Date.now(), status }]);
    await savePlan(null);
  };

  // Reloading after a save, import or demo is when a goal can be crossed: celebrate it.
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const commuteOut = useRef(false);
  commuteOut.current = !!prefs.commuteOut;
  const prevList = useRef(null);
  const reload = useCallback(async () => {
    try {
      const list = await listActivities();
      const won = prevList.current ? newlyReached(goalsRef.current, forTraining(prevList.current, commuteOut.current), forTraining(list, commuteOut.current)) : [];
      const done = prevList.current ? newlyCompleted(forTraining(prevList.current, commuteOut.current), forTraining(list, commuteOut.current)) : [];
      const unlocked = prevList.current ? newlyUnlocked(prevList.current, list) : [];
      prevList.current = list;
      setActivities(list);
      const news = [
        ...won.map((g) => t('🎉 Objectif atteint : {goal}', { goal: goalLabel(g) })),
        ...done.map((c) => t('🏆 Défi terminé : {title}', { title: c.title })),
        ...unlocked.map((a) => t('🏅 Succès débloqué : {title}', { title: a.title })),
      ];
      if (news.length) setToast({ kind: 'notice', goal: true, text: news.join(' · ') });
      return list;
    } catch (e) {
      setToast({ kind: 'error', text: t('Stockage indisponible : {error}', { error: e.message }) });
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Heart rate the watch wrote to Health Connect during recent phone recordings made without a
  // strap. Watches sync with a delay: tried when a recording ends, then at launch and on each
  // return to the app. prompt: ask for Health Connect access (right after a recording).
  const fillWatchHr = useCallback(async (metas, prompt) => {
    const todo = metas.filter((m) => needsWatchHr(m, Date.now()));
    if (!todo.length) return;
    const health = await import('./lib/health.js');
    if (await health.healthStatus() !== 'ready') return;
    let added = false;
    for (const m of todo) {
      const { meta, points } = await getActivity(m.id);
      const merged = addWatchHr(meta, points, await health.readHeartRate(points[0].time, points.at(-1).time, { prompt }));
      if (merged) { await saveActivities([merged]); added = true; }
    }
    if (added) await reload();
  }, [reload]);
  const listed = useRef(null);
  listed.current = activities;
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && listed.current && fillWatchHr(listed.current, false).catch(() => {});
    const first = setTimeout(run, 2000); // once the list is loaded
    document.addEventListener('visibilitychange', run);
    return () => { clearTimeout(first); document.removeEventListener('visibilitychange', run); };
  }, [fillWatchHr]);
  const onRecorded = async (rid) => {
    const list = await reload(); // not listed.current: React hasn't rendered the new list yet
    go(`/activity/${rid}`, true); // back from the new activity skips the finished recording
    fillWatchHr((list ?? []).filter((a) => a.id === rid), true).catch(() => {});
  };

  // Once there is something to lose: ask the browser to keep it, and remind about backups.
  const backupChecked = useRef(false);
  useEffect(() => {
    if (!activities?.length || backupChecked.current) return;
    backupChecked.current = true;
    persistStorage().catch(() => {});
    Promise.all([getSetting('backup'), getSetting('backupNudge')]).then(([last, nudged]) => {
      if (!backupDue({ last, nudged, activities })) return;
      setSetting('backupNudge', Date.now());
      setToast((cur) => cur ?? {
        kind: 'notice',
        text: t('Tes activités ne sont que sur ce téléphone : pense à les sauvegarder.'),
        action: { label: t('Sauvegarder'), run: () => go('/settings') },
      });
    }, () => {});
  }, [activities]);

  // Notices go away on their own (after `ttl` ms, 5 s by default); errors and notices with an
  // action stay until closed, unless they set a `ttl`.
  useEffect(() => {
    const ttl = toast?.ttl ?? (toast?.kind === 'notice' && !toast.action ? 5000 : 0);
    if (!ttl) return;
    const timer = setTimeout(() => setToast((cur) => (cur === toast ? null : cur)), ttl);
    return () => clearTimeout(timer);
  }, [toast]);
  const onDeleted = (undo) => setToast({
    kind: 'notice',
    ttl: 6000,
    text: t('Activité supprimée'),
    action: { label: t('Annuler'), run: () => undo().catch((e) => setToast({ kind: 'error', text: e.message })) },
  });

  const onImport = (files) => files.length && runImport((existing, onProgress) => importFiles(files, existing, onProgress));
  const onHealthImport = () => runImport(async (existing, onProgress) => {
    const { readWorkouts } = await import('./lib/health.js');
    const workouts = await readWorkouts();
    const tasks = healthTasks(workouts);
    await syncRestingHr(true).catch(() => {}); // a missing resting HR never fails the import
    if (!tasks.length) throw new Error(t(workouts.length ? 'Aucune séance importable dans Health Connect.' : 'Aucune séance trouvée dans Health Connect.'));
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
    const { demoHistory } = await import('./lib/demo.js'); // demo tracks stay out of the start-up bundle
    await saveActivities(demoHistory().map((h) => createActivity({ ...h, source: 'demo' })));
    await reload();
  };

  let content;
  if (page === 'activity') content = <ActivityPage id={id} activities={activities} plan={plan} hr={hr} ftp={ftp} weight={hrSaved?.weight} zones={zones} segments={segments ?? []} onSegment={addSegment} gears={gears} onChange={reload} onDeleted={onDeleted} />;
  else if (page === 'log') content = <TrainingLogPage activities={activities} hr={hr} />;
  else if (page === 'maps') content = <MapsPage activities={activities} routes={routes} onSave={keepRoute} />;
  else if (page === 'route') content = <RoutePage id={id} code={sub} activities={activities} onSave={addRoute} onDelete={removeRoute} />;
  else if (page === 'groups' || page === 'challenge') content = <GroupsPage activities={counted} name={prefs.name} incoming={page === 'challenge' ? id : null} />;
  else if (page === 'segment') content = <SegmentPage id={id} segments={segments} activities={activities} onDelete={() => removeSegment(id)} />;
  else if (page === 'plan' && id === 'new') content = <PlanSetupPage activities={activities} goal={sub} onCreate={savePlan} />;
  else if (page === 'plan') content = <PlanPage plan={plan} activities={activities} onSave={savePlan} sessionId={id === 'session' ? sub : null} onStop={async () => { await endPlan('stopped'); go('/', true); }} />;
  else if (page === 'record') content = <RecordPage recording={recording} contacts={contacts} routes={routes} routeId={id === 'workout' ? null : id} workoutId={id === 'workout' ? sub : null} plan={plan} segments={segments ?? []} activities={activities ?? []} hr={hr} prefs={prefs} onSavePrefs={savePrefs} onSaved={onRecorded} />;
  else if (page === 'profile') content = <ProfilePage activities={activities} counted={counted} hr={hr} ftp={ftp} name={prefs.name} goals={goals} onSaveGoals={saveGoals} segments={segments ?? []} gears={gears} onSaveGears={saveGears} />;
  else if (page === 'settings') content = <SettingsPage activities={activities} hr={hr} hrSaved={hrSaved} ftpEstimate={ftpEstimate} onSaveHr={saveHr} units={units} onSaveUnits={saveUnits} lang={lang} onSaveLang={saveLang} prefs={prefs} onSavePrefs={savePrefs} zones={zones} onSaveZones={saveZones} contacts={contacts} onSaveContacts={saveContacts} onDemo={addDemo} onHealthImport={onHealthImport} onChange={reload} />;
  else if (page === 'legal') content = <LegalPage id={id} />;
  else if (page === 'manual') content = <ManualPage id={id} activities={activities} onSaved={async (mid) => { await reload(); if (id) back(`/activity/${mid}`); else go(`/activity/${mid}`, true); }} />;
  else if (page === 'activities') content = <FeedPage activities={activities} name={prefs.name} zones={zones} onRefresh={reload} onImport={onImport} onDemo={addDemo} />;
  else content = <HomePage plan={plan} activities={activities} onImport={onImport} onEndPlan={() => endPlan('done')} />;

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''}`}
      data-drop={t('Dépose tes fichiers')}
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
        <div className={`toast ${toast.kind} row`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" className="ghost small" onClick={() => { setToast(null); toast.action.run(); }}>
              {toast.action.label}
            </button>
          )}
          <button type="button" className="ghost small toast-close" onClick={() => setToast(null)} aria-label={t('Fermer')}>✕</button>
        </div>
      )}
      <ErrorBoundary key={`${page}/${id ?? ''}/${sub ?? ''}/${units}/${lang}/${look}`}>
        <Suspense fallback={<main className="detail" aria-busy="true" />}>{content}</Suspense>
      </ErrorBoundary>
      {!(page === 'record' && recording.rec) && <TabBar active={page === 'plan' ? '' : page === 'manual' ? 'record' : ['activities', 'activity', 'segment', 'log', 'settings', 'legal'].includes(page) ? 'profile' : page === 'route' ? 'maps' : page} recording={recording.rec && (recording.rec.paused ? 'paused' : 'live')} />}
    </div>
  );
}

function importSummary({ ids, duplicates, failed }) {
  const parts = [tn(ids.length, '{n} activité importée', '{n} activités importées')];
  if (duplicates) parts.push(tn(duplicates, '{n} doublon ignoré', '{n} doublons ignorés'));
  if (failed.length) parts.push(tn(failed.length, '{n} échec ({label} : {error})', '{n} échecs ({label} : {error})', failed[0]));
  return { kind: failed.length && !ids.length ? 'error' : 'notice', text: parts.join(' · ') };
}
