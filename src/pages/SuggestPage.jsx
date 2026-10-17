import { useEffect, useRef, useState } from 'react';
import RoutePreview from '../components/RoutePreview.jsx';
import Segmented from '../components/Segmented.jsx';
import TrackMap from '../components/TrackMap.jsx';
import { preview } from '../lib/activity.js';
import { analyze } from '../lib/analyze.js';
import { forEachTrack } from '../lib/db.js';
import { distUnit, elevUnit, fmtDist, fmtElev, isImperial } from '../lib/format.js';
import { currentPosition } from '../lib/location.js';
import { createRoute, fetchRoute, splitLegs } from '../lib/routes.js';
import { SPORTS } from '../lib/sports.js';
import { BEARINGS, cellKey, familiarity, loopWaypoints, rank } from '../lib/suggest.js';
import { back } from '../router.js';

const SPORT_OPTIONS = ['run', 'ride', 'hike'].map((id) => ({ id, label: `${SPORTS[id].icon} ${SPORTS[id].label}` }));
const KM = { run: [3, 30, 10], ride: [10, 150, 40], hike: [5, 30, 12] }; // min, max, default
const TERRAIN = [{ id: '', label: 'Peu importe' }, { id: 'flat', label: 'Plat' }, { id: 'hilly', label: 'Vallonné' }];
const SURFACE = [{ id: '', label: 'Peu importe' }, { id: 'paved', label: 'Route' }, { id: 'trail', label: 'Chemins' }];
const FALLBACK_START = [6.8696, 45.9237]; // Chamonix, where the demo history lives
const OFF_TARGET = 0.15; // a first loop further than this from the target distance is routed again, resized

/** Routes made for you: loops from your position matching distance, terrain, surface and novelty. */
export default function SuggestPage({ activities, onPick }) {
  const [sport, setSport] = useState('run');
  const [km, setKm] = useState(KM.run[2]);
  const [terrain, setTerrain] = useState('');
  const [surface, setSurface] = useState('');
  const [discover, setDiscover] = useState(false);
  const [start, setStart] = useState(null); // { coords, label }
  const [results, setResults] = useState(null); // null | 'loading' | candidates | { error }
  const [picked, setPicked] = useState(0);
  const cells = useRef(null);
  const hover = useRef(() => {});

  useEffect(() => {
    currentPosition().then((p) => {
      const last = activities?.find((a) => a.preview?.length)?.preview[0];
      setStart(p ? { coords: [p.lon, p.lat], label: 'ma position' }
        : last ? { coords: last, label: 'départ de ta dernière activité' }
        : { coords: FALLBACK_START, label: 'Chamonix' });
    });
    // ~100 m cells covered by past tracks, for the "new ground" preference.
    const set = new Set();
    forEachTrack((_, points) => points?.forEach((p) => set.add(cellKey(p.lon, p.lat)))).then(() => { cells.current = set; }, () => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on open

  const pickSport = (s) => { setSport(s); setKm(KM[s][2]); };

  const generate = async () => {
    setResults('loading');
    setPicked(0);
    const target = km * 1000;
    const loop = async (bearing) => {
      let waypoints = loopWaypoints(start.coords, target, bearing);
      let r = await fetchRoute(waypoints, sport);
      const first = analyze(r.points).distance;
      if (Math.abs(first - target) / target > OFF_TARGET) {
        waypoints = loopWaypoints(start.coords, target, bearing, Math.min(2, Math.max(0.5, target / first)));
        r = await fetchRoute(waypoints, sport);
      }
      const { distance, gain } = analyze(r.points);
      return { bearing, waypoints, points: r.points, distance, gain, unpaved: r.unpaved, familiar: familiarity(r.points, cells.current) };
    };
    const all = (await Promise.allSettled(BEARINGS.map(loop))).filter((x) => x.status === 'fulfilled').map((x) => x.value);
    setResults(all.length ? rank(all, { distance: target, terrain, surface, discover }) : { error: 'Aucun itinéraire trouvé : vérifie ta connexion.' });
  };

  const keep = (c) => onPick(createRoute({
    name: `Boucle de ${fmtDist(c.distance, 0)} ${distUnit()}`, sport, snap: true,
    waypoints: c.waypoints, legs: splitLegs(c.points, c.waypoints),
  }));

  const list = Array.isArray(results) ? results : null;
  const [min, max] = KM[sport];
  return (
    <>
      <header className="topbar">
        <a className="back" href="#/maps" aria-label="Retour" onClick={(e) => { e.preventDefault(); back('/maps'); }}>‹</a>
        <h1>Idées d'itinéraires</h1>
        <span className="back" aria-hidden="true" />
      </header>
      <main className="detail">
        <section className="card edit suggest-form">
          <Segmented label="Sport" options={SPORT_OPTIONS} value={sport} onChange={pickSport} />
          <label>Distance : {fmtDist(km * 1000, isImperial() ? 1 : 0)} {distUnit()}
            <input type="range" min={min} max={max} step={sport === 'ride' ? 5 : 1} value={km} onChange={(e) => setKm(Number(e.target.value))} />
          </label>
          <div className="field"><span>Dénivelé</span><Segmented label="Dénivelé" options={TERRAIN} value={terrain} onChange={setTerrain} /></div>
          <div className="field"><span>Revêtement</span><Segmented label="Revêtement" options={SURFACE} value={surface} onChange={setSurface} /></div>
          <label className="switch"><input type="checkbox" checked={discover} onChange={(e) => setDiscover(e.target.checked)} />Découvrir de nouveaux coins</label>
          <p className="muted small-label">Départ : {start ? start.label : 'recherche de ta position…'}</p>
          <button type="button" onClick={generate} disabled={!start || results === 'loading'}>
            {results === 'loading' ? 'Recherche d\'itinéraires…' : 'Proposer des boucles'}
          </button>
        </section>

        {results?.error && <p className="record-status bad" role="alert">{results.error}</p>}
        {list && (
          <>
            <section className="card map-card"><TrackMap key={picked} track={list[picked].points} hover={hover} /></section>
            {list.map((c, i) => (
              <button key={c.bearing} type="button" className={`card link-card route-card suggestion ${i === picked ? 'on' : ''}`} onClick={() => setPicked(i)} aria-pressed={i === picked}>
                <RoutePreview coords={preview(c.points)} />
                <span>
                  <b>{fmtDist(c.distance, 1)} {distUnit()} · {fmtElev(c.gain ?? 0)} {elevUnit()} D+</b>
                  <span className="muted">
                    {c.unpaved != null && `${Math.round(c.unpaved * 100)} % de chemins · `}
                    {cells.current?.size ? `${Math.round((1 - c.familiar) * 100)} % de nouveau` : 'Nouveau terrain'}
                  </span>
                </span>
              </button>
            ))}
            <button type="button" onClick={() => keep(list[picked])}>Garder cet itinéraire</button>
          </>
        )}
      </main>
    </>
  );
}
