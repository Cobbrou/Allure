import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import LiveMap from '../components/LiveMap.jsx';
import StatMetric from '../components/StatMetric.jsx';
import { followRoute } from '../lib/follow.js';
import { liveSegments } from '../lib/liveSegments.js';
import { distUnit, fmtDist, fmtDuration, fmtLength } from '../lib/format.js';
import { haptic } from '../lib/haptics.js';
import { speak, watchPosition } from '../lib/location.js';
import { currentPace, elapsed, lapStatus } from '../lib/recorder.js';
import { joinLegs } from '../lib/routes.js';
import { alertText, checkIn, smsUrl } from '../lib/safety.js';
import { hasBluetooth } from '../lib/sensors.js';
import { effort, SPORTS } from '../lib/sports.js';

/** routeId: route to preselect (from "#/record/<id>"). */
export default function RecordPage({ recording, contacts, routes, routeId, segments, activities, prefs, onSaved }) {
  return (
    <>
      <header className="topbar"><h1>{t('Enregistrer|onglet')}</h1></header>
      {recording.rec ? <Live recording={recording} contacts={contacts} onSaved={onSaved} /> : <Setup recording={recording} contacts={contacts} routes={routes} routeId={routeId} segments={segments} activities={activities} prefs={prefs} />}
    </>
  );
}

function Setup({ recording, contacts, routes, routeId, segments, activities, prefs }) {
  const [routeSel, setRouteSel] = useState(routeId ?? '');
  const route = routes?.find((r) => r.id === routeSel);
  const [sport, setSport] = useState(route?.sport ?? 'run');
  const [autoPause, setAutoPause] = useState(prefs?.autoPause ?? true);
  const [audio, setAudio] = useState(prefs?.audio ?? true);
  const [safety, setSafety] = useState(true);
  const [gps, setGps] = useState(null); // { accuracy } | { error }

  // Warm up the GPS so the first recorded fix is precise.
  useEffect(() => watchPosition((f) => setGps({ accuracy: f.accuracy }), (error) => setGps({ error })), []);

  const go = () => {
    if (audio) speak(t('Enregistrement démarré.')); // also unlocks speech on iOS, which needs a user gesture
    recording.start({ sport, autoPause, audio, safety: safety && contacts.length > 0, route: route && followRoute(route, joinLegs(route.legs)), liveSegs: liveSegments(segments, sport, activities) });
  };

  return (
    <main className="record-setup">
      <div className="sport-picker">
        {Object.entries(SPORTS).map(([sid, s]) => (
          <label key={sid} className={sid === sport ? 'selected' : ''}>
            <input type="radio" name="sport" value={sid} checked={sid === sport} onChange={() => setSport(sid)} />
            <span>{s.icon}</span>{s.label}
          </label>
        ))}
      </div>
      {routes?.length > 0 && (
        <label className="route-select">
          {t('Itinéraire à suivre')}
          <select value={routeSel} onChange={(e) => { setRouteSel(e.target.value); const r = routes.find((x) => x.id === e.target.value); if (r) setSport(r.sport); }}>
            <option value="">{t('Aucun')}</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name} · {fmtDist(r.distance, 1)} {distUnit()}</option>)}
          </select>
        </label>
      )}
      {hasBluetooth() && <StrapButton recording={recording} />}
      <label className="switch"><input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} />{t('Pause automatique')}</label>
      <label className="switch"><input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />{t('Annonces vocales')}</label>
      {contacts.length > 0
        ? <label className="switch"><input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} />{t('Alerte si je reste immobile')}</label>
        : <p className="muted small-label">🛟 {t("Ajoute un contact d'urgence dans les")} <a href="#/settings">{t('paramètres')}</a> {t('pour être alerté si tu restes immobile.')}</p>}
      <p className={`gps ${gps?.error ? 'bad' : gps?.accuracy <= 20 ? 'good' : ''}`} role="status">
        {gps?.error ?? (gps ? t('GPS : précision {dist}', { dist: fmtLength(gps.accuracy) }) : t('Recherche du GPS…'))}
      </p>
      <button type="button" className="record-button" onClick={go}>{t('GO')}</button>
    </main>
  );
}

function Live({ recording, contacts, onSaved }) {
  const { rec, gpsError } = recording;
  const [now, setNow] = useState(Date.now);
  const [tooShort, setTooShort] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = elapsed(rec, now);
  const cur = effort(rec.sport, currentPace(rec));
  const avg = effort(rec.sport, rec.distance > 10 ? time / (rec.distance / 1000) : null);
  const lapNow = lapStatus(rec, now);
  const status = rec.paused ? t('En pause') : rec.autoPaused ? t('Pause auto') : gpsError ?? (rec.follow?.off ? t("Hors de l'itinéraire") : null);

  const finish = async () => {
    const id = await recording.finish();
    if (id) onSaved(id);
    else setTooShort(true);
  };

  return (
    <main className={`record-live ${rec.paused ? 'paused' : ''}`}>
      <section className="live-hero">
        <StatMetric label={t('Temps')} value={fmtDuration(time)} size="xl" />
        <div className="live-row">
          <StatMetric label={t('Distance')} value={fmtDist(rec.distance)} unit={distUnit()} size="lg" />
          <StatMetric label={t('{name} actuelle', { name: cur.short })} value={cur.value} unit={cur.unit} size="lg" />
        </div>
      </section>
      {status && <p className={`record-status ${(gpsError || rec.follow?.off) && !rec.paused ? 'bad' : ''}`} role="status">{status}</p>}
      {tooShort && <p className="record-status bad" role="alert">{t('Trop court pour être enregistré.')}</p>}
      <section className="live-map">
        {rec.pos ? <LiveMap points={rec.points} pos={rec.pos} route={rec.route?.coords} /> : <p className="map-wait muted">{t('Recherche du GPS…')}</p>}
        <div className="live-chips">
          <span className="chip">{t('{name} moy.', { name: avg.short })} <b>{avg.value}</b></span>
          {recording.strap && <span className="chip hr">♥ <b>{recording.strap.bpm ?? '…'}</b></span>}
          {rec.laps?.length > 0 && <span key={rec.laps.length} className="chip lap">{t('Tour {n}', { n: lapNow.n })} <b>{fmtDuration(lapNow.time)}</b></span>}
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

/** Pair or drop a Bluetooth heart rate strap; its bpm is recorded with each GPS fix. */
function StrapButton({ recording }) {
  const [state, setState] = useState(null); // null | 'busy' | error message
  const { strap } = recording;
  const connect = async () => {
    setState('busy');
    try { await recording.connectStrap(); setState(null); } catch (e) {
      setState(e.name === 'NotFoundError' ? null : t('Connexion impossible.')); // NotFoundError: picker closed
    }
  };
  if (strap) {
    return (
      <p className="strap">♥ {strap.name} · <b>{strap.bpm ?? '…'}</b> bpm
        <button type="button" className="ghost small" onClick={recording.disconnectStrap}>{t('Déconnecter')}</button>
      </p>
    );
  }
  return (
    <>
      <button type="button" className="ghost" onClick={connect} disabled={state === 'busy'}>
        {t(state === 'busy' ? 'Recherche…' : '♥ Connecter une ceinture cardio')}
      </button>
      {state && state !== 'busy' && <p className="gps bad" role="alert">{state}</p>}
    </>
  );
}
