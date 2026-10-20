import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import BottomSheet from '../components/BottomSheet.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import Icon from '../components/Icon.jsx';
import LiveMap from '../components/LiveMap.jsx';
import RecordScreenEditor from '../components/RecordScreenEditor.jsx';
import StatMetric from '../components/StatMetric.jsx';
import { followRoute } from '../lib/follow.js';
import { liveSegments } from '../lib/liveSegments.js';
import { distUnit, fmtDist, fmtDuration, fmtLength } from '../lib/format.js';
import { haptic } from '../lib/haptics.js';
import { hush, speak, watchPosition } from '../lib/location.js';
import { FIELDS, layoutFor } from '../lib/liveFields.js';
import { elapsed, lapStatus, MAX_ACCURACY } from '../lib/recorder.js';
import { getRoute } from '../lib/db.js';
import { joinLegs } from '../lib/routes.js';
import { alertText, checkIn, smsUrl } from '../lib/safety.js';
import { hasBluetooth } from '../lib/sensors.js';
import { SPORTS } from '../lib/sports.js';

/** routeId: route to preselect (from "#/record/<id>"). */
export default function RecordPage({ recording, contacts, routes, routeId, segments, activities, hr, prefs, onSavePrefs, onSaved }) {
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
        : <Setup recording={recording} contacts={contacts} routes={routes} routeId={routeId} segments={segments} activities={activities} prefs={prefs} onSavePrefs={onSavePrefs} onEditScreen={setEditing} />}
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

function Setup({ recording, contacts, routes, routeId, segments, activities, prefs, onSavePrefs, onEditScreen }) {
  const [routeSel, setRouteSel] = useState(routeId ?? '');
  const route = routes?.find((r) => r.id === routeSel);
  const [sport, setSport] = useState(route?.sport ?? (SPORTS[prefs?.sport] ? prefs.sport : 'run')); // defaults to the last sport recorded
  const [autoPause, setAutoPause] = useState(prefs?.autoPause ?? true);
  const [audio, setAudio] = useState(prefs?.audio ?? true);
  const [safety, setSafety] = useState(true);
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
    recording.start({ sport, autoPause, audio, voice: prefs?.voice, safety: safety && contacts.length > 0, route: full && followRoute(full, joinLegs(full.legs)), liveSegs: liveSegments(segments, sport, activities) });
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

  const [sheet, setSheet] = useState(null); // 'sport' | 'route' picker open
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
    const id = await recording.finish().finally(() => setSaving(false));
    if (id) onSaved(id);
    else setTooShort(true);
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
      <section className={layout.map ? 'live-map' : 'live-extras'}>
        {layout.map && (rec.pos ? <LiveMap points={rec.points} pos={rec.pos} route={rec.route?.coords} /> : <p className="map-wait muted">{t('Recherche du GPS…')}</p>)}
        <div className="live-chips">
          {rec.laps?.length > 0 && !fields.includes('lap') && layout.hero !== 'lap' && <span key={rec.laps.length} className="chip lap">{t('Tour {n}', { n: lapNow.n })} <b>{fmtDuration(lapNow.time)}</b></span>}
          <SegmentChip rec={rec} now={now} />
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
