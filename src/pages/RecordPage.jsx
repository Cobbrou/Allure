import { useEffect, useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import LiveMap from '../components/LiveMap.jsx';
import { followRoute } from '../lib/follow.js';
import { fmtDuration } from '../lib/format.js';
import { speak, watchPosition } from '../lib/location.js';
import { currentPace, elapsed } from '../lib/recorder.js';
import { joinLegs } from '../lib/routes.js';
import { effort, SPORTS } from '../lib/sports.js';

/** routeId: route to preselect (from "#/record/<id>"). */
export default function RecordPage({ recording, routes, routeId, onSaved }) {
  return (
    <>
      <header className="topbar"><h1>Enregistrer</h1></header>
      {recording.rec ? <Live recording={recording} onSaved={onSaved} /> : <Setup recording={recording} routes={routes} routeId={routeId} />}
    </>
  );
}

function Setup({ recording, routes, routeId }) {
  const [routeSel, setRouteSel] = useState(routeId ?? '');
  const route = routes?.find((r) => r.id === routeSel);
  const [sport, setSport] = useState(route?.sport ?? 'run');
  const [autoPause, setAutoPause] = useState(true);
  const [audio, setAudio] = useState(true);
  const [gps, setGps] = useState(null); // { accuracy } | { error }

  // Warm up the GPS so the first recorded fix is precise.
  useEffect(() => watchPosition((f) => setGps({ accuracy: f.accuracy }), (error) => setGps({ error })), []);

  const go = () => {
    if (audio) speak('Enregistrement démarré.'); // also unlocks speech on iOS, which needs a user gesture
    recording.start({ sport, autoPause, audio, route: route && followRoute(route, joinLegs(route.legs)) });
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
          Itinéraire à suivre
          <select value={routeSel} onChange={(e) => { setRouteSel(e.target.value); const r = routes.find((x) => x.id === e.target.value); if (r) setSport(r.sport); }}>
            <option value="">Aucun</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name} · {(r.distance / 1000).toFixed(1)} km</option>)}
          </select>
        </label>
      )}
      <label className="switch"><input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} />Pause automatique</label>
      <label className="switch"><input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />Annonces vocales</label>
      <p className={`gps ${gps?.error ? 'bad' : gps?.accuracy <= 20 ? 'good' : ''}`} role="status">
        {gps?.error ?? (gps ? `GPS : précision ${Math.round(gps.accuracy)} m` : 'Recherche du GPS…')}
      </p>
      <button type="button" className="record-button" onClick={go}>GO</button>
    </main>
  );
}

function Live({ recording, onSaved }) {
  const { rec, gpsError } = recording;
  const [now, setNow] = useState(Date.now);
  const [tooShort, setTooShort] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = elapsed(rec, now);
  const cur = effort(rec.sport, currentPace(rec));
  const avg = effort(rec.sport, rec.distance > 10 ? time / (rec.distance / 1000) : null);
  const status = rec.paused ? 'En pause' : rec.autoPaused ? 'Pause auto' : gpsError ?? (rec.follow?.off ? "Hors de l'itinéraire" : null);

  const finish = async () => {
    const id = await recording.finish();
    if (id) onSaved(id);
    else setTooShort(true);
  };

  return (
    <main className="record-live">
      <div className="stats">
        <div className="card stat"><div className="label">Temps</div><div className="value">{fmtDuration(time)}</div></div>
        <div className="card stat"><div className="label">Distance</div><div className="value">{(rec.distance / 1000).toFixed(2)}<small>km</small></div></div>
        <div className="card stat"><div className="label">{cur.short} actuelle</div><div className="value">{cur.value}<small>{cur.unit}</small></div></div>
        <div className="card stat"><div className="label">{avg.short} moyenne</div><div className="value">{avg.value}<small>{avg.unit}</small></div></div>
      </div>
      {status && <p className={`record-status ${(gpsError || rec.follow?.off) && !rec.paused ? 'bad' : ''}`} role="status">{status}</p>}
      {rec.route && (
        <p className="follow-bar">
          <span>🧭 {rec.route.name}</span>
          <b>{rec.follow?.done ? 'Terminé' : `${(Math.max(0, rec.route.distance - (rec.follow?.along ?? 0)) / 1000).toFixed(2)} km restants`}</b>
        </p>
      )}
      <section className="card map-card">
        {rec.pos ? <LiveMap points={rec.points} pos={rec.pos} route={rec.route?.coords} /> : <p className="map-wait muted">Recherche du GPS…</p>}
      </section>
      {tooShort && <p className="record-status bad" role="alert">Trop court pour être enregistré.</p>}
      <div className="record-controls">
        {rec.paused ? (
          <>
            <ConfirmButton onConfirm={recording.discard} confirmLabel="Supprimer ?">Supprimer</ConfirmButton>
            <button type="button" className="ghost" onClick={recording.resume}>Reprendre</button>
            <button type="button" onClick={finish}>Terminer</button>
          </>
        ) : (
          <button type="button" className="record-button pause" onClick={recording.pause} aria-label="Pause">❚❚</button>
        )}
      </div>
    </main>
  );
}
