import { useEffect, useState } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import LiveMap from '../components/LiveMap.jsx';
import StatMetric from '../components/StatMetric.jsx';
import { followRoute } from '../lib/follow.js';
import { liveSegments } from '../lib/liveSegments.js';
import { fmtDuration } from '../lib/format.js';
import { speak, watchPosition } from '../lib/location.js';
import { currentPace, elapsed, lapStatus } from '../lib/recorder.js';
import { joinLegs } from '../lib/routes.js';
import { effort, SPORTS } from '../lib/sports.js';

/** routeId: route to preselect (from "#/record/<id>"). */
export default function RecordPage({ recording, routes, routeId, segments, activities, onSaved }) {
  return (
    <>
      <header className="topbar"><h1>Enregistrer</h1></header>
      {recording.rec ? <Live recording={recording} onSaved={onSaved} /> : <Setup recording={recording} routes={routes} routeId={routeId} segments={segments} activities={activities} />}
    </>
  );
}

function Setup({ recording, routes, routeId, segments, activities }) {
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
    recording.start({ sport, autoPause, audio, route: route && followRoute(route, joinLegs(route.legs)), liveSegs: liveSegments(segments, sport, activities) });
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
  const lapNow = lapStatus(rec, now);
  const status = rec.paused ? 'En pause' : rec.autoPaused ? 'Pause auto' : gpsError ?? (rec.follow?.off ? "Hors de l'itinéraire" : null);

  const finish = async () => {
    const id = await recording.finish();
    if (id) onSaved(id);
    else setTooShort(true);
  };

  return (
    <main className={`record-live ${rec.paused ? 'paused' : ''}`}>
      <section className="live-hero">
        <StatMetric label="Temps" value={fmtDuration(time)} size="xl" />
        <div className="live-row">
          <StatMetric label="Distance" value={(rec.distance / 1000).toFixed(2)} unit="km" size="lg" />
          <StatMetric label={`${cur.short} actuelle`} value={cur.value} unit={cur.unit} size="lg" />
        </div>
      </section>
      {status && <p className={`record-status ${(gpsError || rec.follow?.off) && !rec.paused ? 'bad' : ''}`} role="status">{status}</p>}
      {tooShort && <p className="record-status bad" role="alert">Trop court pour être enregistré.</p>}
      <section className="live-map">
        {rec.pos ? <LiveMap points={rec.points} pos={rec.pos} route={rec.route?.coords} /> : <p className="map-wait muted">Recherche du GPS…</p>}
        <div className="live-chips">
          <span className="chip">{avg.short} moy. <b>{avg.value}</b></span>
          {rec.laps?.length > 0 && <span key={rec.laps.length} className="chip lap">Tour {lapNow.n} <b>{fmtDuration(lapNow.time)}</b></span>}
          <SegmentChip rec={rec} now={now} />
          {rec.route && (
            <span className="chip follow">🧭 <b>{rec.follow?.done ? 'Terminé' : `${(Math.max(0, rec.route.distance - (rec.follow?.along ?? 0)) / 1000).toFixed(2)} km`}</b></span>
          )}
        </div>
      </section>
      <div className="dock">
        {rec.paused ? (
          <>
            <ConfirmButton className="dock-btn danger" onConfirm={recording.discard} confirmLabel="Supprimer ?">Supprimer</ConfirmButton>
            <button type="button" className="dock-main" onClick={recording.resume} aria-label="Reprendre">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button type="button" className="dock-btn finish" onClick={finish}>Terminer</button>
          </>
        ) : (
          <>
            <button type="button" className="dock-btn" onClick={recording.lap}>Tour</button>
            <button type="button" className="dock-main" onClick={recording.pause} aria-label="Pause">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
            </button>
            <ConfirmButton className="dock-btn" onConfirm={finish} confirmLabel="Terminer ?">Terminer</ConfirmButton>
          </>
        )}
      </div>
    </main>
  );
}

const RECENT = 30000; // ms a finished segment stays on screen

/** Live segment in progress (time and distance left), or the one just finished. */
function SegmentChip({ rec, now }) {
  const { active, last } = rec.seg ?? {};
  const seg = (id) => rec.liveSegs.find((s) => s.id === id);
  if (active) {
    const left = seg(active.id).line.distance - (active.follow?.along ?? 0);
    return <span className="chip seg">⚡ {seg(active.id).name} <b>{fmtDuration((now - active.start) / 1000)}</b> {Math.round(Math.max(0, left))} m</span>;
  }
  if (!last || now - last.at > RECENT) return null;
  const pr = last.pr != null && last.time < last.pr;
  return <span className={`chip seg ${pr ? 'pr' : ''}`}>⚡ {seg(last.id).name} <b>{fmtDuration(last.time)}</b>{pr && ' Record !'}</span>;
}
