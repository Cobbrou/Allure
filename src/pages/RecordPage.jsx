import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../components/BottomSheet.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import Icon from '../components/Icon.jsx';
import LiveMap from '../components/LiveMap.jsx';
import RecordScreenEditor from '../components/RecordScreenEditor.jsx';
import StatMetric from '../components/StatMetric.jsx';
import WorkoutEditor, { fmtRange, workoutSummary } from '../components/WorkoutEditor.jsx';
import { followRoute } from '../lib/follow.js';
import { liveSegments } from '../lib/liveSegments.js';
import { distUnit, fmtDist, fmtDuration, fmtLength, fmtPaceUnit } from '../lib/format.js';
import { haptic } from '../lib/haptics.js';
import { hush, speak, watchPosition } from '../lib/location.js';
import { FIELDS, layoutFor } from '../lib/liveFields.js';
import { elapsed, lapStatus, MAX_ACCURACY } from '../lib/recorder.js';
import { getRoute } from '../lib/db.js';
import { joinLegs } from '../lib/routes.js';
import { alertText, checkIn, smsUrl } from '../lib/safety.js';
import { hasBluetooth } from '../lib/sensors.js';
import { currentVdot, trainingPaces } from '../lib/paces.js';
import { sessionsOn, sessionWorkout, SESSION_TYPES } from '../lib/plan.js';
import { SPORTS } from '../lib/sports.js';
import { DEFAULT_WORKOUT, INTENSITIES, LIBRARY, livePace, startWorkout, stepLabel, stepStatus } from '../lib/workout.js';

/**
 * routeId: route to preselect (from "#/record/<id>"). workoutId: workout to preselect (from
 * "#/record/workout/<id>"): a LIBRARY id or "plan:<session id>"; today's plan session by default.
 */
export default function RecordPage({ recording, contacts, routes, routeId, workoutId, plan, segments, activities, hr, prefs, onSavePrefs, onSaved }) {
  const [editing, setEditing] = useState(null); // sport whose screen layout is being edited
  const live = recording.rec;
  return (
    <>
      {live && (
        <header className="topbar">
          <h1>{t('Enregistrer|onglet')}</h1>
          <button type="button" className="ghost small" onClick={() => setEditing(live.sport)}>{t('Écran')}</button>
        </header>
      )}
      {live
        ? <Live recording={recording} contacts={contacts} layout={layoutFor(prefs.recordScreen, live.sport)} maxHr={hr.max} onSaved={onSaved} />
        : <Setup recording={recording} contacts={contacts} routes={routes} routeId={routeId} workoutId={workoutId} plan={plan} segments={segments} activities={activities} prefs={prefs} onSavePrefs={onSavePrefs} onEditScreen={setEditing} />}
      <BottomSheet open={editing != null} onClose={() => setEditing(null)} title={t("Écran d'enregistrement · {sport}", { sport: SPORTS[editing]?.label })}>
        {editing && (
          <RecordScreenEditor
            layout={layoutFor(prefs.recordScreen, editing)}
            onChange={(l) => onSavePrefs({ ...prefs, recordScreen: { ...prefs.recordScreen, [editing]: l } })}
          />
        )}
      </BottomSheet>
    </>
  );
}

function Setup({ recording, contacts, routes, routeId, workoutId, plan, segments, activities, prefs, onSavePrefs, onEditScreen }) {
  const [routeSel, setRouteSel] = useState(routeId ?? '');
  const route = routes?.find((r) => r.id === routeSel);
  const [sport, setSport] = useState(route?.sport ?? (SPORTS[prefs?.sport] ? prefs.sport : 'run')); // defaults to the last sport recorded
  const [autoPause, setAutoPause] = useState(prefs?.autoPause ?? true);
  const [audio, setAudio] = useState(prefs?.audio ?? true);
  const [safety, setSafety] = useState(true);
  // A plan session: the one asked for, else today's (the race is run free).
  const session = workoutId?.startsWith('plan:')
    ? plan?.sessions.find((s) => `plan:${s.id}` === workoutId)
    : !workoutId && plan && sessionsOn(plan, Date.now()).find((s) => s.type !== 'race' && !s.status);
  const preset = session ? `plan:${session.id}` : LIBRARY.some((w) => w.id === workoutId) ? workoutId : null;
  const [withWorkout, setWithWorkout] = useState(!!preset);
  const [pick, setPick] = useState(preset ?? 'custom'); // 'custom', 'plan:<id>', a LIBRARY id or a saved workout's id
  const custom = { ...DEFAULT_WORKOUT, ...prefs?.workout };
  const saved = prefs?.workouts ?? [];
  const workout = session && pick === `plan:${session.id}` ? sessionWorkout(session)
    : pick === 'custom' ? custom : LIBRARY.find((w) => w.id === pick) ?? saved.find((w) => w.id === pick) ?? custom;
  const historyFit = useMemo(() => currentVdot(activities), [activities]);
  // Plan sessions run at the plan's fitness, so the paces match the plan page.
  const fit = session && pick === `plan:${session.id}` ? { vdot: plan.vdot } : historyFit;
  const paces = fit && trainingPaces(fit.vdot);
  const keep = () => onSavePrefs({ ...prefs, workouts: [...saved, { ...custom, id: crypto.randomUUID() }] });
  const drop = (wid) => { if (pick === wid) setPick('custom'); onSavePrefs({ ...prefs, workouts: saved.filter((w) => w.id !== wid) }); };
  const [gps, setGps] = useState(null); // last fix { lat, lon, accuracy… } | { error }

  // Warm up the GPS so the first recorded fix is precise. An error keeps the last position on the map.
  useEffect(() => watchPosition(setGps, (error) => setGps((g) => ({ ...g, error }))), []);

  const [count, setCount] = useState(null); // 3, 2, 1 before the clock starts
  const go = () => {
    if (audio) speak('3'); // also unlocks speech on iOS, which needs a user gesture
    haptic('tap');
    setCount(3);
  };
  // The clock starts after the countdown, outside the tap: the page already had a user gesture,
  // which is what Chrome wants for the lock-screen audio.
  const begin = async () => {
    setCount(null);
    if (sport !== prefs?.sport) onSavePrefs({ ...prefs, sport });
    if (audio) { hush(); speak(t('Enregistrement démarré.')); }
    const full = route && (await getRoute(route.id)); // the list holds metas, not points
    recording.start({ sport, autoPause, audio, voice: prefs?.voice, safety: safety && contacts.length > 0, route: full && followRoute(full, joinLegs(full.legs)), liveSegs: liveSegments(segments, sport, activities), workout: withWorkout ? startWorkout(workout, fit?.vdot) : null });
  };
  useEffect(() => {
    if (count == null) return;
    const timer = setTimeout(() => {
      if (count === 1) return begin();
      if (audio) speak(String(count - 1));
      haptic('tap');
      setCount(count - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [count]);

  const [sheet, setSheet] = useState(null); // 'sport' | 'route' picker or 'workout' editor open
  const pickRoute = (r) => { setRouteSel(r?.id ?? ''); if (r) setSport(r.sport); setSheet(null); };
  const gpsLevel = gps?.error ? 'bad' : !gps ? '' : gps.accuracy <= 20 ? 'good' : 'warn';
  const zero = { rec: { sport, distance: 0, points: [] }, time: 0 }; // the live fields, before the start

  return (
    <main className="record-setup">
      <div className="setup-stage">
        <div className="setup-map">{gps?.lat != null && <LiveMap points={[]} pos={gps} />}</div>
        <header className="setup-top">
          <h1>{t('Enregistrer|onglet')}</h1>
          <div className="setup-toggles">
            <button type="button" className={`round ${autoPause ? 'on' : ''}`} aria-pressed={autoPause} aria-label={t('Pause automatique')} title={t('Pause automatique')} onClick={() => setAutoPause(!autoPause)}><Icon name="pause" /></button>
            <button type="button" className={`round ${audio ? 'on' : ''}`} aria-pressed={audio} aria-label={t('Annonces vocales')} title={t('Annonces vocales')} onClick={() => setAudio(!audio)}><Icon name="volume" /></button>
            <a className="round" href="#/manual" aria-label={t('Ajouter une activité manuelle')} title={t('Ajouter une activité manuelle')}><Icon name="edit" /></a>
            <button type="button" className="round" aria-label={t("Personnaliser l'écran")} title={t("Personnaliser l'écran")} onClick={() => onEditScreen(sport)}><Icon name="layout" /></button>
          </div>
        </header>
        <div className="setup-pills">
          {contacts.length > 0
            ? <button type="button" className={`pill ${safety ? 'on' : ''}`} aria-pressed={safety} onClick={() => setSafety(!safety)}><Icon name={safety ? 'shieldCheck' : 'shieldAlert'} />{t('Alerte si je reste immobile')}</button>
            : <a className="pill warn" href="#/settings"><Icon name="shieldAlert" />{t("Contact d'urgence non configuré")}</a>}
          <button type="button" className={`pill ${withWorkout ? 'on' : ''}`} onClick={() => setSheet('workout')}>
            <Icon name="timer" />{withWorkout ? workout.name ?? workoutSummary(workout) : t('Séance')}
          </button>
          {hasBluetooth() && <SensorButton recording={recording} kind="hr" />}
          {hasBluetooth() && sport === 'ride' && <SensorButton recording={recording} kind="cadence" />}
          {hasBluetooth() && sport === 'ride' && <SensorButton recording={recording} kind="power" />}
        </div>
        <section className="telemetry">
          <p className={`gps-banner ${gpsLevel}`} role="status">
            <Icon name="signal" />
            {gps?.error ?? (gps ? t(gpsLevel === 'good' ? 'Signal GPS prêt · précision {dist}' : 'Signal GPS faible · précision {dist}', { dist: fmtLength(gps.accuracy) }) : t('Recherche du GPS…'))}
          </p>
          <div className="telemetry-grid">
            {['time', 'avg', 'distance'].map((f) => <StatMetric key={f} {...FIELDS[f].get(zero)} size="lg" />)}
          </div>
        </section>
      </div>
      <div className="setup-dock">
        <span className="sheet-handle" aria-hidden="true" />
        <button type="button" className="dock-side" onClick={() => setSheet('sport')} aria-label={t('Sport : {sport}', { sport: SPORTS[sport].label })}>
          <span className="dock-round sport"><Icon name={sport} /><Icon name="check" className="dock-badge" /></span>
          <span className="dock-label">{SPORTS[sport].label}</span>
        </button>
        <button type="button" className="dock-go" onClick={go} aria-label={t('GO')}><Icon name="play" /></button>
        <button type="button" className="dock-side" onClick={() => setSheet('route')}>
          <span className="dock-round"><Icon name="route" /></span>
          <span className="dock-label">{route ? <><i className="dot" />{route.name}</> : t('Itinéraire')}</span>
        </button>
      </div>
      <BottomSheet open={sheet === 'sport'} onClose={() => setSheet(null)} title={t('Sport')}>
        <div className="pick-list">
          {Object.entries(SPORTS).map(([sid, s]) => (
            <button key={sid} type="button" className={sid === sport ? 'on' : ''} aria-pressed={sid === sport} onClick={() => { setSport(sid); setSheet(null); }}>
              <Icon name={sid} />{s.label}
            </button>
          ))}
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'workout'} onClose={() => setSheet(null)} title={t('Séance structurée')}>
        <div className="pick-list">
          {session && (
            <button type="button" className={pick === `plan:${session.id}` ? 'on' : ''} aria-pressed={pick === `plan:${session.id}`} onClick={() => setPick(`plan:${session.id}`)}>
              <Icon name="timer" /><span>{t('Plan : {type}', { type: SESSION_TYPES[session.type].label })}</span><small>{workoutSummary(session)}</small>
            </button>
          )}
          {LIBRARY.map((w) => (
            <button key={w.id} type="button" className={pick === w.id ? 'on' : ''} aria-pressed={pick === w.id} onClick={() => setPick(w.id)}>
              <span>{w.name}</span><small>{workoutSummary(w)}</small>
            </button>
          ))}
          {saved.map((w) => (
            <div key={w.id} className="pick-row">
              <button type="button" className={pick === w.id ? 'on' : ''} aria-pressed={pick === w.id} onClick={() => setPick(w.id)}>
                <span>{workoutSummary(w)}</span>{w.pace && <small>{INTENSITIES.find((i) => i.id === w.pace)?.label}</small>}
              </button>
              <ConfirmButton className="ghost" label={t('Supprimer cette séance')} onConfirm={() => drop(w.id)}>✕</ConfirmButton>
            </div>
          ))}
          <button type="button" className={pick === 'custom' ? 'on' : ''} aria-pressed={pick === 'custom'} onClick={() => setPick('custom')}>
            <Icon name="edit" /><span>{t('Personnalisée')}</span>
          </button>
        </div>
        {pick === 'custom' && (
          <>
            <WorkoutEditor workout={custom} paces={paces} onChange={(w) => onSavePrefs({ ...prefs, workout: w })} />
            <button type="button" className="ghost" onClick={keep}>{t('Garder dans mes séances')}</button>
          </>
        )}
        <p className="muted small-label">
          {fit ? t('Allures cibles calculées sur un VDOT de {vdot}.', { vdot: fit.vdot }) : t('Pas de course récente (90 jours) : la séance se suivra sans allure cible.')}
        </p>
        <div className="edit-actions">
          {withWorkout && <button type="button" className="ghost" onClick={() => { setWithWorkout(false); setSheet(null); }}>{t('Sans séance')}</button>}
          <button type="button" onClick={() => { setWithWorkout(true); setSheet(null); }}>{t('Suivre cette séance')}</button>
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'route'} onClose={() => setSheet(null)} title={t('Itinéraire à suivre')}>
        <div className="pick-list">
          <button type="button" className={route ? '' : 'on'} aria-pressed={!route} onClick={() => pickRoute(null)}>{t('Aucun')}</button>
          {routes?.map((r) => (
            <button key={r.id} type="button" className={r === route ? 'on' : ''} aria-pressed={r === route} onClick={() => pickRoute(r)}>
              <Icon name={r.sport} /><span>{r.name}</span><small>{fmtDist(r.distance, 1)} {distUnit()}</small>
            </button>
          ))}
          {!routes?.length && <p className="muted">{t('Aucun itinéraire pour le moment. Crée-en un depuis')} <a href="#/maps">{t('Cartes')}</a>.</p>}
        </div>
      </BottomSheet>
      {count != null && (
        <div className="countdown" role="timer" aria-live="assertive">
          <button type="button" className="countdown-skip" onClick={begin} aria-label={t('Démarrer maintenant')}>
            <span key={count}>{count}</span>
            <small>{t('Touche pour démarrer maintenant')}</small>
          </button>
          <button type="button" className="ghost" onClick={() => { hush(); setCount(null); }}>{t('Annuler')}</button>
        </div>
      )}
    </main>
  );
}

/** layout: { map, hero, fields } from layoutFor(). */
function Live({ recording, contacts, layout, maxHr, onSaved }) {
  const { rec, gpsError } = recording;
  const [now, setNow] = useState(Date.now);
  const [tooShort, setTooShort] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = elapsed(rec, now);
  const { sensors } = recording;
  const ctx = { rec, now, time, bpm: sensors.hr?.hr ?? null, cad: sensors.cadence?.cad ?? sensors.power?.cad ?? null, power: sensors.power?.power ?? null, maxHr };
  // No sensor, no tile for what it measures.
  const fields = layout.fields.filter((f) => ((f !== 'hr' && f !== 'zone') || sensors.hr) && (f !== 'cad' || sensors.cadence || sensors.power) && (f !== 'power' || sensors.power));
  const lapNow = lapStatus(rec, now);
  const weak = rec.pos?.accuracy > MAX_ACCURACY && !rec.points.length; // nothing recorded yet: waiting for precision
  const status = saving ? t('Enregistrement…') : rec.paused ? t('En pause') : rec.autoPaused ? t('Pause auto') : gpsError
    ?? (weak ? t('Signal GPS faible · précision {dist}', { dist: fmtLength(rec.pos.accuracy) }) : rec.follow?.off ? t("Hors de l'itinéraire") : null);

  const finish = async () => {
    setSaving(true);
    setFailed(null);
    try {
      const id = await recording.finish();
      if (id) onSaved(id);
      else setTooShort(true);
    } catch (e) {
      setFailed(e.message); // storage full or unavailable: the recording and its draft stay
    } finally { setSaving(false); }
  };

  return (
    <main className={`record-live ${rec.paused ? 'paused' : ''} ${layout.map ? '' : 'no-map'}`}>
      <section className="live-hero">
        <StatMetric {...FIELDS[layout.hero].get(ctx)} size="xl" />
        {fields.length > 0 && (
          <div className="live-row">
            {fields.map((f) => <StatMetric key={f} {...FIELDS[f].get(ctx)} size="lg" className={f === 'hr' || f === 'zone' ? 'hr' : ''} />)}
          </div>
        )}
      </section>
      {status && <p className={`record-status ${(gpsError || weak || rec.follow?.off) && !rec.paused ? 'bad' : ''}`} role="status">{status}</p>}
      {tooShort && <p className="record-status bad" role="alert">{t('Trop court pour être enregistré.')}</p>}
      {failed && <p className="record-status bad" role="alert">{t("Enregistrement impossible : {error}. La sortie n'est pas perdue, réessaie.", { error: failed })}</p>}
      <section className={layout.map ? 'live-map' : 'live-extras'}>
        {layout.map && (rec.pos ? <LiveMap points={rec.points} pos={rec.pos} route={rec.route?.coords} /> : <p className="map-wait muted">{t('Recherche du GPS…')}</p>)}
        <div className="live-chips">
          {rec.laps?.length > 0 && !rec.workout && !fields.includes('lap') && layout.hero !== 'lap' && <span key={rec.laps.length} className="chip lap">{t('Tour {n}', { n: lapNow.n })} <b>{fmtDuration(lapNow.time)}</b></span>}
          <StepChip rec={rec} now={now} />
          <SegmentChip rec={rec} now={now} />
          {recording.lost.map((kind) => <SensorButton key={kind} recording={recording} kind={kind} />)}
          {rec.route && (
            <span className="chip follow">🧭 <b>{rec.follow?.done ? t('Terminé') : `${fmtDist(Math.max(0, rec.route.distance - (rec.follow?.along ?? 0)))} ${distUnit()}`}</b></span>
          )}
        </div>
        {contacts.length > 0 && <a className="sos" href={smsUrl(contacts, alertText(rec, now, true))} aria-label={t("Envoyer ma position à mes contacts d'urgence")}>{t('SOS')}</a>}
      </section>
      <div className="dock">
        {rec.paused ? (
          <>
            <ConfirmButton className="dock-btn danger" onConfirm={recording.discard} confirmLabel={t('Supprimer ?')}>{t('Supprimer')}</ConfirmButton>
            <button type="button" className="dock-main" onClick={recording.resume} aria-label={t('Reprendre')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button type="button" className="dock-btn finish" onClick={finish}>{t('Terminer')}</button>
          </>
        ) : (
          <>
            <button type="button" className="dock-btn" onClick={recording.lap}>{t('Tour')}</button>
            <button type="button" className="dock-main" onClick={recording.pause} aria-label={t('Pause')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
            </button>
            <ConfirmButton className="dock-btn" onConfirm={finish} confirmLabel={t('Terminer ?')}>{t('Terminer')}</ConfirmButton>
          </>
        )}
      </div>
      {rec.safety && contacts.length > 0 && <CheckIn rec={rec} now={now} contacts={contacts} />}
    </main>
  );
}

/**
 * Safety check-in: after a long stillness, ask whether all is well, with an alarm; with no
 * answer, open the alert SMS (last position) to the emergency contacts. Moving again or
 * answering "Je vais bien" closes it.
 */
function CheckIn({ rec, now, contacts }) {
  const [okAt, setOkAt] = useState(0);
  const check = checkIn(rec, now, okAt);
  const url = check && smsUrl(contacts, alertText(rec, now));
  useEffect(() => {
    if (!check) return;
    haptic('alarm');
    if (check.stage === 'ask') speak(t("Tout va bien ? Touche l'écran pour confirmer."));
    else {
      speak(t("Alerte. Envoie le message à tes contacts d'urgence."));
      window.location.href = url; // opens the SMS app where allowed without a tap; the button stays as a fallback
    }
  }, [check?.stage]); // eslint-disable-line react-hooks/exhaustive-deps -- fire once per stage
  if (!check) return null;
  const min = Math.floor((now - rec.lastMove) / 60000);
  return (
    <div className="checkin" role="alertdialog" aria-labelledby="checkin-title" aria-describedby="checkin-text">
      <h2 id="checkin-title">{t(check.stage === 'ask' ? 'Tout va bien ?' : 'Alerte prête')}</h2>
      <p id="checkin-text">
        {check.stage === 'ask'
          ? <>{t("Tu ne bouges plus depuis {min} min. Sans réponse, tes contacts d'urgence seront alertés dans", { min })} <b>{check.left} s</b>.</>
          : t('Envoie le SMS avec ta position à {names}.', { names: contacts.map((c) => c.name).join(', ') })}
      </p>
      <button type="button" className="checkin-ok" onClick={() => { haptic('tap'); setOkAt(Date.now()); }}>{t('Je vais bien')}</button>
      <a className={`button ${check.stage === 'ask' ? 'ghost' : 'danger armed'}`} href={url}>{t(check.stage === 'ask' ? 'Alerter maintenant' : "Envoyer l'alerte SMS")}</a>
    </div>
  );
}

const RECENT = 30000; // ms a finished segment stays on screen

/** Live segment in progress (time and distance left), or the one just finished. */
function SegmentChip({ rec, now }) {
  const { active, last } = rec.seg ?? {};
  const seg = (id) => rec.liveSegs.find((s) => s.id === id);
  if (active) {
    const left = seg(active.id).line.distance - (active.follow?.along ?? 0);
    return <span className="chip seg">⚡ {seg(active.id).name} <b>{fmtDuration((now - active.start) / 1000)}</b> {fmtLength(Math.max(0, left))}</span>;
  }
  if (!last || now - last.at > RECENT) return null;
  const pr = last.pr != null && last.time < last.pr;
  return <span className={`chip seg ${pr ? 'pr' : ''}`}>⚡ {seg(last.id).name} <b>{fmtDuration(last.time)}</b>{pr && t(' Record !')}</span>;
}

const SENSOR_PILLS = {
  hr: { icon: 'heart', className: 'hr', get label() { return t('Ceinture cardio'); }, value: (s) => s.hr, unit: 'bpm' },
  cadence: { icon: 'ride', className: '', get label() { return t('Cadence'); }, value: (s) => s.cad, unit: 'rpm' },
  power: { icon: 'zap', className: '', get label() { return t('Puissance'); }, value: (s) => s.power, unit: 'W' },
};

/** Current workout step and what is left of it. */
function StepChip({ rec, now }) {
  if (!rec.workout) return null;
  const s = stepStatus(rec, now);
  if (!s) return <span className="chip step">{t('Séance terminée')}</span>;
  const range = s.step.target?.range, pace = range && livePace(rec.workout);
  const off = pace && (pace < range[0] ? 'fast' : pace > range[1] ? 'slow' : 'ok');
  return (
    <span key={rec.workout.i} className={`chip step ${s.step.kind}`}>
      {stepLabel(s.step, rec.workout.reps)} <b>{s.step.type === 'time' ? fmtDuration(s.left) : fmtLength(s.left)}</b>
      {range && <small className={`step-pace ${off ?? ''}`}>{fmtRange(range)}{pace ? ` · ${fmtPaceUnit(pace)}` : ''}</small>}
    </span>
  );
}

/** Pair or drop a Bluetooth sensor of a kind; its readings are recorded with each GPS fix. */
function SensorButton({ recording, kind }) {
  const [state, setState] = useState(null); // null | 'busy' | error message
  const pill = SENSOR_PILLS[kind];
  const sensor = recording.sensors[kind];
  const connect = async () => {
    setState('busy');
    try { await recording.connectSensor(kind); setState(null); } catch (e) {
      setState(e.name === 'NotFoundError' ? null : t('Connexion impossible.')); // NotFoundError: picker closed
    }
  };
  if (sensor) {
    return (
      <button type="button" className={`pill on ${pill.className}`} onClick={() => recording.disconnectSensor(kind)} aria-label={t('Déconnecter {name}', { name: sensor.name })}>
        <Icon name={pill.icon} />{sensor.name} · <b>{pill.value(sensor) ?? '…'}</b> {pill.unit}
      </button>
    );
  }
  return (
    <button type="button" className={`pill ${state && state !== 'busy' ? 'bad' : ''}`} onClick={connect} disabled={state === 'busy'}>
      <Icon name={pill.icon} />{state === 'busy' ? t('Recherche…') : state || pill.label}
    </button>
  );
}
